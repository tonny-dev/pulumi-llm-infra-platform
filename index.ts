import * as pulumi from "@pulumi/pulumi";
import { bucketName } from "./infra/bucket";
import { vpcId, publicSubnets } from "./infra/vpc";
import { logsBucket } from "./infra/s3";
import { env, image, cpu, memory, secretApiKey } from "./infra/config";
import { LLMService } from "./infra/ecsService";

// ECS service
new LLMService("llm-api", {
  image,
  cpu,
  memory,
  env: {
    API_KEY: secretApiKey,
  },
});

export const outBucketName = bucketName;
export const outVpcId = vpcId;
export const outSubnets = publicSubnets;
export const outLogsBucket = logsBucket.id;
