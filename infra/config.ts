import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();
export const env = config.require("project:env");
export const image = config.require("app:image");
export const cpu = config.getNumber("app:cpu") ?? 256;
export const memory = config.getNumber("app:memory") ?? 512;
export const secretApiKey = config.requireSecret("app:apiKey");
export const openaiApiKey = config.requireSecret("openai:apiKey");
