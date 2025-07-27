import * as aws from "@pulumi/aws";

export const logsBucket = new aws.s3.Bucket("llm-logs", {
  versioning: { enabled: true },
  tags: { purpose: "llm-logs" }
});
