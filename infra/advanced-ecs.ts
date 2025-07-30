import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export interface AdvancedECSServiceArgs {
  cluster: aws.ecs.Cluster;
  vpc: aws.ec2.Vpc;
  subnets: aws.ec2.Subnet[];
  image: string;
  cpu: number;
  memory: number;
  desiredCount: number;
  enableGpu?: boolean;
  gpuCount?: number;
  environment: { [key: string]: string };
  secrets: { [key: string]: pulumi.Input<string> };
  enableAutoScaling?: boolean;
  minCapacity?: number;
  maxCapacity?: number;
}

export class AdvancedECSService extends pulumi.ComponentResource {
  public readonly service: aws.ecs.Service;
  public readonly taskDefinition: aws.ecs.TaskDefinition;
  public readonly loadBalancer?: aws.lb.LoadBalancer;
  public readonly targetGroup?: aws.lb.TargetGroup;
  public readonly autoScalingTarget?: aws.appautoscaling.Target;

  constructor(name: string, args: AdvancedECSServiceArgs, opts?: pulumi.ComponentResourceOptions) {
    super("custom:ecs:AdvancedService", name, {}, opts);

    // Security Group for ECS Service
    const securityGroup = new aws.ec2.SecurityGroup(`${name}-sg`, {
      vpcId: args.vpc.id,
      description: "Security group for LLM ECS service",
      ingress: [
        {
          protocol: "tcp",
          fromPort: 80,
          toPort: 80,
          cidrBlocks: ["0.0.0.0/0"],
        },
        {
          protocol: "tcp",
          fromPort: 443,
          toPort: 443,
          cidrBlocks: ["0.0.0.0/0"],
        },
        {
          protocol: "tcp",
          fromPort: 8080,
          toPort: 8080,
          cidrBlocks: ["10.0.0.0/8"],
        }
      ],
      egress: [
        {
          protocol: "-1",
          fromPort: 0,
          toPort: 0,
          cidrBlocks: ["0.0.0.0/0"],
        }
      ],
      tags: {
        Name: `${name}-security-group`,
        Environment: args.environment.NODE_ENV || "dev"
      }
    }, { parent: this });

    // IAM Role for Task Execution
    const taskExecutionRole = new aws.iam.Role(`${name}-execution-role`, {
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: {
              Service: "ecs-tasks.amazonaws.com"
            }
          }
        ]
      })
    }, { parent: this });

    // Attach policies to execution role
    new aws.iam.RolePolicyAttachment(`${name}-execution-policy`, {
      role: taskExecutionRole.name,
      policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
    }, { parent: this });

    // IAM Role for Task
    const taskRole = new aws.iam.Role(`${name}-task-role`, {
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: {
              Service: "ecs-tasks.amazonaws.com"
            }
          }
        ]
      })
    }, { parent: this });

    // Custom policy for S3 and CloudWatch access
    const taskPolicy = new aws.iam.Policy(`${name}-task-policy`, {
      policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: [
              "s3:GetObject",
              "s3:PutObject",
              "s3:DeleteObject",
              "s3:ListBucket"
            ],
            Resource: ["*"]
          },
          {
            Effect: "Allow",
            Action: [
              "logs:CreateLogGroup",
              "logs:CreateLogStream",
              "logs:PutLogEvents"
            ],
            Resource: ["*"]
          }
        ]
      })
    }, { parent: this });

    new aws.iam.RolePolicyAttachment(`${name}-task-policy-attachment`, {
      role: taskRole.name,
      policyArn: taskPolicy.arn
    }, { parent: this });

    // CloudWatch Log Group
    const logGroup = new aws.cloudwatch.LogGroup(`${name}-logs`, {
      name: `/ecs/${name}`,
      retentionInDays: 7,
      tags: {
        Environment: args.environment.NODE_ENV || "dev"
      }
    }, { parent: this });

    // Task Definition with GPU support
    const containerDefinitions = [{
      name: name,
      image: args.image,
      cpu: args.cpu,
      memory: args.memory,
      essential: true,
      portMappings: [
        {
          containerPort: 8080,
          protocol: "tcp"
        }
      ],
      environment: Object.entries(args.environment).map(([name, value]) => ({
        name,
        value
      })),
      secrets: Object.entries(args.secrets).map(([name, valueFrom]) => ({
        name,
        valueFrom
      })),
      logConfiguration: {
        logDriver: "awslogs",
        options: {
          "awslogs-group": logGroup.name,
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      ...(args.enableGpu && {
        resourceRequirements: [
          {
            type: "GPU",
            value: (args.gpuCount || 1).toString()
          }
        ]
      })
    }];

    this.taskDefinition = new aws.ecs.TaskDefinition(`${name}-task`, {
      family: name,
      networkMode: "awsvpc",
      requiresCompatibilities: ["FARGATE"],
      cpu: args.cpu.toString(),
      memory: args.memory.toString(),
      executionRoleArn: taskExecutionRole.arn,
      taskRoleArn: taskRole.arn,
      containerDefinitions: JSON.stringify(containerDefinitions),
      tags: {
        Environment: args.environment.NODE_ENV || "dev"
      }
    }, { parent: this });

    // Application Load Balancer
    this.loadBalancer = new aws.lb.LoadBalancer(`${name}-alb`, {
      name: `${name}-alb`.substring(0, 32),
      internal: false,
      loadBalancerType: "application",
      securityGroups: [securityGroup.id],
      subnets: args.subnets.map(s => s.id),
      enableDeletionProtection: false,
      tags: {
        Environment: args.environment.NODE_ENV || "dev"
      }
    }, { parent: this });

    this.targetGroup = new aws.lb.TargetGroup(`${name}-tg`, {
      name: `${name}-tg`.substring(0, 32),
      port: 8080,
      protocol: "HTTP",
      vpcId: args.vpc.id,
      targetType: "ip",
      healthCheck: {
        enabled: true,
        healthyThreshold: 2,
        interval: 30,
        matcher: "200",
        path: "/health",
        port: "traffic-port",
        protocol: "HTTP",
        timeout: 5,
        unhealthyThreshold: 2
      },
      tags: {
        Environment: args.environment.NODE_ENV || "dev"
      }
    }, { parent: this });

    // ALB Listener
    new aws.lb.Listener(`${name}-listener`, {
      loadBalancerArn: this.loadBalancer.arn,
      port: 80,
      protocol: "HTTP",
      defaultActions: [
        {
          type: "forward",
          targetGroupArn: this.targetGroup.arn
        }
      ]
    }, { parent: this });

    // ECS Service
    this.service = new aws.ecs.Service(`${name}-service`, {
      cluster: args.cluster.arn,
      taskDefinition: this.taskDefinition.arn,
      desiredCount: args.desiredCount,
      launchType: "FARGATE",
      networkConfiguration: {
        subnets: args.subnets.map(s => s.id),
        securityGroups: [securityGroup.id],
        assignPublicIp: true
      },
      loadBalancers: [
        {
          targetGroupArn: this.targetGroup.arn,
          containerName: name,
          containerPort: 8080
        }
      ],
      tags: {
        Environment: args.environment.NODE_ENV || "dev"
      }
    }, { parent: this, dependsOn: [this.targetGroup] });

    // Auto Scaling Configuration
    if (args.enableAutoScaling) {
      this.autoScalingTarget = new aws.appautoscaling.Target(`${name}-scaling-target`, {
        maxCapacity: args.maxCapacity || 10,
        minCapacity: args.minCapacity || 1,
        resourceId: pulumi.interpolate`service/${args.cluster.name}/${this.service.name}`,
        scalableDimension: "ecs:service:DesiredCount",
        serviceNamespace: "ecs"
      }, { parent: this });

      // CPU-based scaling policy
      new aws.appautoscaling.Policy(`${name}-cpu-scaling`, {
        name: `${name}-cpu-scaling`,
        policyType: "TargetTrackingScaling",
        resourceId: this.autoScalingTarget.resourceId,
        scalableDimension: this.autoScalingTarget.scalableDimension,
        serviceNamespace: this.autoScalingTarget.serviceNamespace,
        targetTrackingScalingPolicyConfiguration: {
          predefinedMetricSpecification: {
            predefinedMetricType: "ECSServiceAverageCPUUtilization"
          },
          targetValue: 70.0,
          scaleInCooldown: 300,
          scaleOutCooldown: 300
        }
      }, { parent: this });

      // Memory-based scaling policy
      new aws.appautoscaling.Policy(`${name}-memory-scaling`, {
        name: `${name}-memory-scaling`,
        policyType: "TargetTrackingScaling",
        resourceId: this.autoScalingTarget.resourceId,
        scalableDimension: this.autoScalingTarget.scalableDimension,
        serviceNamespace: this.autoScalingTarget.serviceNamespace,
        targetTrackingScalingPolicyConfiguration: {
          predefinedMetricSpecification: {
            predefinedMetricType: "ECSServiceAverageMemoryUtilization"
          },
          targetValue: 80.0,
          scaleInCooldown: 300,
          scaleOutCooldown: 300
        }
      }, { parent: this });
    }

    this.registerOutputs({
      service: this.service,
      taskDefinition: this.taskDefinition,
      loadBalancer: this.loadBalancer,
      targetGroup: this.targetGroup,
      autoScalingTarget: this.autoScalingTarget
    });
  }
}
