import * as aws from "@pulumi/aws";

const bucket = new aws.s3.Bucket("my-bucket", {
  tags: {
    Project: "PulumiLLMInfra",
  },
});

new aws.s3.BucketAclV2("my-bucket-acl", {
  bucket: bucket.id,
  acl: "private",
});

export const bucketName = bucket.id;
