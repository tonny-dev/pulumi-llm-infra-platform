import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();
const env = config.require("project:env");

export const vpc = new awsx.ec2.Vpc(`${env}-vpc`, {
  cidrBlock: "10.0.0.0/16",
  numberOfAvailabilityZones: 2,
  natGateways: {
    strategy: "Single",
  },
  tags: {
    "Environment": env,
    "Project": "PulumiLLMInfra",
  },
});

export const vpcId = vpc.vpcId; // <-- fix for: 'vpcId' not found
export const publicSubnets = vpc.publicSubnetIds; // <-- fix for: 'publicSubnets' not found
