import * as aws from "@pulumi/aws";
import { vpc } from "./vpc";

export const serviceSG = new aws.ec2.SecurityGroup("ecs-service-sg", {
  vpcId: vpc.vpc.id,
  description: "Allow traffic to ECS service",
  ingress: [
    { protocol: "tcp", fromPort: 80, toPort: 80, cidrBlocks: ["0.0.0.0/0"] },
  ],
  egress: [
    { protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] },
  ],
});
