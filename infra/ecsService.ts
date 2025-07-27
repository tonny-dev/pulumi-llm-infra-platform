import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { vpc } from "./vpc";
import { serviceSG } from "./securityGroup";

// ECS Cluster
const cluster = new aws.ecs.Cluster("llm-cluster", {
  tags: {
    Project: "PulumiLLMInfra",
  },
});

// Execution Role for ECS Tasks
const executionRole = new aws.iam.Role("ecs-execution-role", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [{
      Action: "sts:AssumeRole",
      Effect: "Allow",
      Principal: {
        Service: "ecs-tasks.amazonaws.com",
      },
    }],
  }),
});

new aws.iam.RolePolicyAttachment("ecs-execution-role-policy", {
  role: executionRole.name,
  policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
});

export interface LLMServiceArgs {
  image: string;
  cpu: number;
  memory: number;
  env: Record<string, pulumi.Input<string>>;
}

export class LLMService extends pulumi.ComponentResource {
  constructor(name: string, args: LLMServiceArgs, opts?: pulumi.ComponentResourceOptions) {
    super("custom:LLMService", name, {}, opts);

    const taskDef = new aws.ecs.TaskDefinition(`${name}-task`, {
      family: name,
      cpu: args.cpu.toString(),
      memory: args.memory.toString(),
      networkMode: "awsvpc",
      requiresCompatibilities: ["FARGATE"],
      executionRoleArn: executionRole.arn,
      containerDefinitions: JSON.stringify([
        {
          name,
          image: args.image,
          portMappings: [{
            containerPort: 80,
            protocol: "tcp",
          }],
          environment: Object.entries(args.env).map(([k, v]) => ({ name: k, value: v })),
          logConfiguration: {
            logDriver: "awslogs",
            options: {
              "awslogs-group": `/ecs/${name}`,
              "awslogs-region": aws.getRegionOutput().name,
              "awslogs-stream-prefix": "ecs",
            },
          },
        },
      ]),
    });

    // CloudWatch Log Group
    new aws.cloudwatch.LogGroup(`${name}-logs`, {
      name: `/ecs/${name}`,
      retentionInDays: 7,
    });

    new aws.ecs.Service(`${name}-svc`, {
      cluster: cluster.arn,
      desiredCount: 1,
      launchType: "FARGATE",
      taskDefinition: taskDef.arn,
      networkConfiguration: {
        subnets: vpc.privateSubnetIds,
        assignPublicIp: false,
        securityGroups: [serviceSG.id],
      },
    });
  }
}
