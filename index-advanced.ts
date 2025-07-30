import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { AdvancedECSService } from "./infra/advanced-ecs";

// Load configuration
const config = new pulumi.Config();
const projectConfig = new pulumi.Config("project");
const appConfig = new pulumi.Config("app");
const openaiConfig = new pulumi.Config("openai");

// Project settings
const projectName = projectConfig.get("name") || "llm-infra-platform";
const environment = projectConfig.get("env") || "dev";
const region = aws.getRegion().then(r => r.name);

// Application settings
const containerImage = appConfig.require("image");
const containerCpu = appConfig.getNumber("cpu") || 512;
const containerMemory = appConfig.getNumber("memory") || 1024;
const desiredCount = appConfig.getNumber("desiredCount") || 2;
const enableGpu = appConfig.getBoolean("enableGpu") || false;
const gpuCount = appConfig.getNumber("gpuCount") || 1;

// Secrets
const apiKey = appConfig.requireSecret("apiKey");
const openaiApiKey = openaiConfig.requireSecret("apiKey");

// Create VPC with enhanced configuration
const vpc = new aws.ec2.Vpc(`${projectName}-vpc`, {
  cidrBlock: "10.0.0.0/16",
  enableDnsHostnames: true,
  enableDnsSupport: true,
  tags: {
    Name: `${projectName}-vpc`,
    Environment: environment,
    Project: projectName,
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

// Hardcode availability zones for us-east-1
const availabilityZones = ["us-east-1a", "us-east-1b"];

// Create public subnets
const publicSubnets = availabilityZones.map((az, index) => 
  new aws.ec2.Subnet(`${projectName}-public-subnet-${index + 1}`, {
    vpcId: vpc.id,
    cidrBlock: `10.0.${index + 1}.0/24`,
    availabilityZone: az,
    mapPublicIpOnLaunch: true,
    tags: {
      Name: `${projectName}-public-subnet-${index + 1}`,
      Environment: environment,
      Type: "public",
    },
  })
);

// ECS Cluster
const cluster = new aws.ecs.Cluster(`${projectName}-cluster`, {
  name: `${projectName}-cluster`,
  settings: [
    {
      name: "containerInsights",
      value: "enabled",
    },
  ],
  tags: {
    Name: `${projectName}-cluster`,
    Environment: environment,
  },
});

// S3 Buckets
const primaryBucket = new aws.s3.Bucket(`${projectName}-primary`, {
  bucket: `${projectName}-primary-${environment}`,
  versioning: {
    enabled: true,
  },
  serverSideEncryptionConfiguration: {
    rule: {
      applyServerSideEncryptionByDefault: {
        sseAlgorithm: "AES256",
      },
    },
  },
  tags: {
    Name: `${projectName}-primary`,
    Environment: environment,
  },
});

// Secrets Manager for API keys
const apiKeySecret = new aws.secretsmanager.Secret(`${projectName}-api-key`, {
  name: `${projectName}/${environment}/api-key`,
  description: "API key for LLM service",
  tags: {
    Environment: environment,
    Project: projectName,
  },
});

new aws.secretsmanager.SecretVersion(`${projectName}-api-key-version`, {
  secretId: apiKeySecret.id,
  secretString: apiKey,
});

const openaiKeySecret = new aws.secretsmanager.Secret(`${projectName}-openai-key`, {
  name: `${projectName}/${environment}/openai-key`,
  description: "OpenAI API key",
  tags: {
    Environment: environment,
    Project: projectName,
  },
});

new aws.secretsmanager.SecretVersion(`${projectName}-openai-key-version`, {
  secretId: openaiKeySecret.id,
  secretString: openaiApiKey,
});

// Deploy Advanced ECS Service
const llmService = new AdvancedECSService(`${projectName}-llm-service`, {
  cluster,
  vpc,
  subnets: publicSubnets,
  image: containerImage,
  cpu: containerCpu,
  memory: containerMemory,
  desiredCount,
  enableGpu,
  gpuCount,
  enableAutoScaling: true,
  minCapacity: 1,
  maxCapacity: 10,
  environment: {
    NODE_ENV: environment,
    PROJECT_NAME: projectName,
    AWS_REGION: "us-east-1",
  },
  secrets: {
    API_KEY: apiKeySecret.arn,
    OPENAI_API_KEY: openaiKeySecret.arn,
  },
});

// Outputs
export const vpcId = vpc.id;
export const publicSubnetIds = publicSubnets.map(s => s.id);
export const primaryBucketName = primaryBucket.bucket;
export const clusterName = cluster.name;
export const serviceArn = llmService.service.id;
export const loadBalancerDns = llmService.loadBalancer?.dnsName;
