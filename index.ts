import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

// Load configuration
const config = new pulumi.Config();
const projectConfig = new pulumi.Config("project");
const appConfig = new pulumi.Config("app");
const openaiConfig = new pulumi.Config("openai");

// Project settings
const projectName = projectConfig.get("name") || "llm-platform";
const environment = projectConfig.get("env") || "dev";

// Application settings
const containerImage = appConfig.require("image");
const containerCpu = appConfig.getNumber("cpu") || 256;
const containerMemory = appConfig.getNumber("memory") || 512;

// Secrets
const apiKey = appConfig.requireSecret("apiKey");
const openaiApiKey = openaiConfig.requireSecret("apiKey");

// Create VPC
const vpc = new aws.ec2.Vpc(`${projectName}-vpc`, {
  cidrBlock: "10.0.0.0/16",
  enableDnsHostnames: true,
  enableDnsSupport: true,
  tags: {
    Name: `${projectName}-vpc`,
    Environment: environment,
  },
});

// Internet Gateway
const internetGateway = new aws.ec2.InternetGateway(`${projectName}-igw`, {
  vpcId: vpc.id,
  tags: {
    Name: `${projectName}-igw`,
    Environment: environment,
  },
});

// Create public subnets
const publicSubnet1 = new aws.ec2.Subnet(`${projectName}-subnet-1`, {
  vpcId: vpc.id,
  cidrBlock: "10.0.1.0/24",
  availabilityZone: "us-east-1a",
  mapPublicIpOnLaunch: true,
  tags: {
    Name: `${projectName}-subnet-1`,
    Environment: environment,
  },
});

const publicSubnet2 = new aws.ec2.Subnet(`${projectName}-subnet-2`, {
  vpcId: vpc.id,
  cidrBlock: "10.0.2.0/24",
  availabilityZone: "us-east-1b",
  mapPublicIpOnLaunch: true,
  tags: {
    Name: `${projectName}-subnet-2`,
    Environment: environment,
  },
});

// Route table for public subnets
const publicRouteTable = new aws.ec2.RouteTable(`${projectName}-rt`, {
  vpcId: vpc.id,
  tags: {
    Name: `${projectName}-rt`,
    Environment: environment,
  },
});

// Route to internet gateway
new aws.ec2.Route(`${projectName}-route`, {
  routeTableId: publicRouteTable.id,
  destinationCidrBlock: "0.0.0.0/0",
  gatewayId: internetGateway.id,
});

// Associate subnets with route table
new aws.ec2.RouteTableAssociation(`${projectName}-rta-1`, {
  subnetId: publicSubnet1.id,
  routeTableId: publicRouteTable.id,
});

new aws.ec2.RouteTableAssociation(`${projectName}-rta-2`, {
  subnetId: publicSubnet2.id,
  routeTableId: publicRouteTable.id,
});

// S3 Bucket
const primaryBucket = new aws.s3.Bucket(`${projectName}-bucket`, {
  bucket: `${projectName}-bucket-${environment}`,
  tags: {
    Name: `${projectName}-bucket`,
    Environment: environment,
  },
});

// ECS Cluster
const cluster = new aws.ecs.Cluster(`${projectName}-cluster`, {
  name: `${projectName}-cluster`,
  tags: {
    Name: `${projectName}-cluster`,
    Environment: environment,
  },
});

// Security Group for ECS Service
const securityGroup = new aws.ec2.SecurityGroup(`${projectName}-sg`, {
  vpcId: vpc.id,
  description: "Security group for LLM ECS service",
  ingress: [
    {
      protocol: "tcp",
      fromPort: 80,
      toPort: 80,
      cidrBlocks: ["0.0.0.0/0"],
    },
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
    Name: `${projectName}-sg`,
    Environment: environment,
  }
});

// IAM Role for Task Execution
const taskExecutionRole = new aws.iam.Role(`${projectName}-exec-role`, {
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
});

// Attach policy to execution role
new aws.iam.RolePolicyAttachment(`${projectName}-exec-policy`, {
  role: taskExecutionRole.name,
  policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
});

// CloudWatch Log Group
const logGroup = new aws.cloudwatch.LogGroup(`${projectName}-logs`, {
  name: `/ecs/${projectName}`,
  retentionInDays: 7,
});

// Task Definition
const taskDefinition = new aws.ecs.TaskDefinition(`${projectName}-task`, {
  family: projectName,
  networkMode: "awsvpc",
  requiresCompatibilities: ["FARGATE"],
  cpu: containerCpu.toString(),
  memory: containerMemory.toString(),
  executionRoleArn: taskExecutionRole.arn,
  containerDefinitions: JSON.stringify([{
    name: projectName,
    image: containerImage,
    cpu: containerCpu,
    memory: containerMemory,
    essential: true,
    portMappings: [
      {
        containerPort: 80,
        protocol: "tcp"
      }
    ],
    environment: [
      {
        name: "NODE_ENV",
        value: environment
      }
    ],
    logConfiguration: {
      logDriver: "awslogs",
      options: {
        "awslogs-group": logGroup.name,
        "awslogs-region": "us-east-1",
        "awslogs-stream-prefix": "ecs"
      }
    }
  }]),
});

// ECS Service
const service = new aws.ecs.Service(`${projectName}-service`, {
  cluster: cluster.arn,
  taskDefinition: taskDefinition.arn,
  desiredCount: 1,
  launchType: "FARGATE",
  networkConfiguration: {
    subnets: [publicSubnet1.id, publicSubnet2.id],
    securityGroups: [securityGroup.id],
    assignPublicIp: true
  },
});

// Outputs
export const vpcId = vpc.id;
export const publicSubnetIds = [publicSubnet1.id, publicSubnet2.id];
export const primaryBucketName = primaryBucket.bucket;
export const clusterName = cluster.name;
export const serviceArn = service.id;
