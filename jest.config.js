import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { logsBucket } from "../infra/s3";

test("Bucket should have versioning enabled", async () => {
  const versioning = await logsBucket.versioning;
  expect(versioning?.enabled).toBe(true);
});
