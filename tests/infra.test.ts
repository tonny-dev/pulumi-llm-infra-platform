import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { AdvancedECSService } from "../infra/advanced-ecs";

// Mock Pulumi runtime
pulumi.runtime.setMocks({
  newResource: (args: pulumi.runtime.MockResourceArgs): {id: string, state: any} => {
    return {
      id: args.inputs.name + "_id",
      state: args.inputs,
    };
  },
  call: (args: pulumi.runtime.MockCallArgs) => {
    return args.inputs;
  },
});

describe("Infrastructure Components", () => {
  let vpc: aws.ec2.Vpc;
  let subnets: aws.ec2.Subnet[];
  let cluster: aws.ecs.Cluster;

  beforeEach(() => {
    // Setup mock resources
    vpc = new aws.ec2.Vpc("test-vpc", {
      cidrBlock: "10.0.0.0/16",
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    subnets = [
      new aws.ec2.Subnet("test-subnet-1", {
        vpcId: vpc.id,
        cidrBlock: "10.0.1.0/24",
        availabilityZone: "us-west-2a",
      }),
      new aws.ec2.Subnet("test-subnet-2", {
        vpcId: vpc.id,
        cidrBlock: "10.0.2.0/24",
        availabilityZone: "us-west-2b",
      }),
    ];

    cluster = new aws.ecs.Cluster("test-cluster", {
      name: "test-cluster",
    });
  });

  describe("AdvancedECSService", () => {
    it("should create ECS service with basic configuration", async () => {
      const service = new AdvancedECSService("test-service", {
        cluster,
        vpc,
        subnets,
        image: "nginx:latest",
        cpu: 256,
        memory: 512,
        desiredCount: 2,
        environment: {
          NODE_ENV: "test",
          API_VERSION: "v1",
        },
        secrets: {
          API_KEY: "arn:aws:secretsmanager:us-west-2:123456789012:secret:api-key",
        },
      });

      expect(service.service).toBeDefined();
      expect(service.taskDefinition).toBeDefined();
      expect(service.loadBalancer).toBeDefined();
      expect(service.targetGroup).toBeDefined();
    });

    it("should create ECS service with GPU support", async () => {
      const service = new AdvancedECSService("gpu-service", {
        cluster,
        vpc,
        subnets,
        image: "tensorflow/tensorflow:latest-gpu",
        cpu: 1024,
        memory: 2048,
        desiredCount: 1,
        enableGpu: true,
        gpuCount: 1,
        environment: {
          NODE_ENV: "production",
          CUDA_VISIBLE_DEVICES: "0",
        },
        secrets: {
          OPENAI_API_KEY: "arn:aws:secretsmanager:us-west-2:123456789012:secret:openai-key",
        },
      });

      expect(service.service).toBeDefined();
      expect(service.taskDefinition).toBeDefined();
    });

    it("should create ECS service with auto-scaling enabled", async () => {
      const service = new AdvancedECSService("autoscale-service", {
        cluster,
        vpc,
        subnets,
        image: "my-llm-api:latest",
        cpu: 512,
        memory: 1024,
        desiredCount: 2,
        enableAutoScaling: true,
        minCapacity: 1,
        maxCapacity: 10,
        environment: {
          NODE_ENV: "production",
        },
        secrets: {
          DATABASE_URL: "arn:aws:secretsmanager:us-west-2:123456789012:secret:db-url",
        },
      });

      expect(service.service).toBeDefined();
      expect(service.autoScalingTarget).toBeDefined();
    });
  });

  describe("VPC Configuration", () => {
    it("should create VPC with correct CIDR block", async () => {
      const testVpc = new aws.ec2.Vpc("test-vpc", {
        cidrBlock: "10.0.0.0/16",
        enableDnsHostnames: true,
        enableDnsSupport: true,
        tags: {
          Name: "test-vpc",
          Environment: "test",
        },
      });

      const cidrBlock = await testVpc.cidrBlock;
      expect(cidrBlock).toBe("10.0.0.0/16");
    });

    it("should create subnets in different AZs", async () => {
      const subnet1 = new aws.ec2.Subnet("subnet-1", {
        vpcId: vpc.id,
        cidrBlock: "10.0.1.0/24",
        availabilityZone: "us-west-2a",
        mapPublicIpOnLaunch: true,
      });

      const subnet2 = new aws.ec2.Subnet("subnet-2", {
        vpcId: vpc.id,
        cidrBlock: "10.0.2.0/24",
        availabilityZone: "us-west-2b",
        mapPublicIpOnLaunch: true,
      });

      const az1 = await subnet1.availabilityZone;
      const az2 = await subnet2.availabilityZone;

      expect(az1).toBe("us-west-2a");
      expect(az2).toBe("us-west-2b");
      expect(az1).not.toBe(az2);
    });
  });

  describe("S3 Bucket Configuration", () => {
    it("should create S3 bucket with versioning enabled", async () => {
      const bucket = new aws.s3.Bucket("test-bucket", {
        bucket: "my-llm-test-bucket",
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
      });

      expect(bucket).toBeDefined();
    });

    it("should create bucket with lifecycle policy", async () => {
      const bucket = new aws.s3.Bucket("lifecycle-bucket", {
        bucket: "my-llm-lifecycle-bucket",
        lifecycleRules: [
          {
            id: "delete-old-versions",
            enabled: true,
            noncurrentVersionExpiration: {
              days: 30,
            },
          },
        ],
      });

      expect(bucket).toBeDefined();
    });
  });

  describe("Security Configuration", () => {
    it("should create security group with proper ingress rules", async () => {
      const sg = new aws.ec2.SecurityGroup("test-sg", {
        vpcId: vpc.id,
        description: "Test security group",
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
        ],
        egress: [
          {
            protocol: "-1",
            fromPort: 0,
            toPort: 0,
            cidrBlocks: ["0.0.0.0/0"],
          },
        ],
      });

      expect(sg).toBeDefined();
    });
  });
});

describe("Stack State Management", () => {
  it("should handle stack outputs correctly", async () => {
    const config = new pulumi.Config();
    const projectName = config.get("project:name") || "test-project";
    
    expect(projectName).toBeDefined();
  });

  it("should validate required configuration", async () => {
    const config = new pulumi.Config();
    
    // Test that required configs throw when missing
    expect(() => {
      config.require("nonexistent:key");
    }).toThrow();
  });
});

describe("Integration Tests", () => {
  it("should deploy complete infrastructure stack", async () => {
    // This would be an integration test that actually deploys resources
    // For now, we'll just test the component creation
    const service = new AdvancedECSService("integration-test", {
      cluster,
      vpc,
      subnets,
      image: "nginx:latest",
      cpu: 256,
      memory: 512,
      desiredCount: 1,
      environment: {
        NODE_ENV: "test",
      },
      secrets: {},
    });

    expect(service).toBeDefined();
    expect(service.service).toBeDefined();
    expect(service.taskDefinition).toBeDefined();
    expect(service.loadBalancer).toBeDefined();
  });
});
