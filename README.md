# 🚀 Pulumi LLM Infra Platform

This project provisions a complete cloud infrastructure using **Pulumi** and **TypeScript** to deploy a containerized LLM (Large Language Model) API backend on **AWS**. It's built with scalability, modularity, and best practices in mind.

---

## 📦 Features

- ✅ VPC with public and private subnets
- ✅ ECS Fargate deployment for an LLM-based API service
- ✅ S3 buckets for file storage and logging
- ✅ Environment-specific configurations
- ✅ Secret management for API keys (e.g. OpenAI)
- ✅ Modular architecture (`vpc`, `s3`, `ecsService`, etc.)

---

## 📁 Project Structure

```

.
├── infra/
│   ├── bucket.ts         # Defines primary S3 bucket
│   ├── vpc.ts            # VPC and subnet setup
│   ├── ecsService.ts     # ECS Fargate service deployment
│   ├── s3.ts             # Additional buckets (e.g., logs)
│   └── config.ts         # Pulumi config loading helpers
├── index.ts              # Entry point: deploys all resources
├── Pulumi.dev.yaml       # Pulumi-generated stack config file
└── README.md             # Project overview and usage

````

---

## 🧰 Requirements

- Node.js ≥ v16
- [Pulumi CLI](https://www.pulumi.com/docs/get-started/install/) ≥ v3
- AWS CLI + credentials configured (`~/.aws/credentials`)
- Docker (for pushing container image)

---

## ⚙️ Setup Instructions

### 1. Clone and Install

```bash
git clone https://github.com/your-org/pulumi-llm-infra-platform.git
cd pulumi-llm-infra-platform
npm install
````

### 2. Initialize Pulumi Stack

```bash
pulumi stack init dev
```

> Replace `dev` with another name for other environments (e.g., `staging`, `prod`).

---

## 🔐 Set Configuration Values

Use the following Pulumi config commands to define infrastructure values and secrets.

### 🔧 App Parameters

```bash
pulumi config set project:env dev
pulumi config set app:image your-dockerhub-org/llm-api:latest
pulumi config set app:cpu 256
pulumi config set app:memory 512
```

### 🔑 Secrets

```bash
pulumi config set --secret app:apiKey pul-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
pulumi config set --secret openai:apiKey sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 🔍 View Config

```bash
pulumi config
```

---

## 🚀 Deploy Infrastructure

Preview and deploy your full stack to AWS:

```bash
pulumi up
```

> Confirm the proposed changes when prompted.

### 🧹 Destroy Resources

To tear down the infrastructure:

```bash
pulumi destroy
```

---

## 📤 Output Variables

After `pulumi up`, you’ll get outputs like:

* `outBucketName` – Name of the S3 bucket
* `outVpcId` – ID of the custom VPC
* `outSubnets` – IDs of the created public subnets
* `outLogsBucket` – Name of the log S3 bucket

These are defined in `index.ts` and returned using `pulumi.export()`.

---

## ⚠️ Notes

* `BucketAclV2` is **deprecated**. Prefer `aws.s3.BucketAcl` for future implementations.
* Make sure your IAM user/role has full access to:

  * S3
  * ECS/Fargate
  * EC2/VPC networking
  * CloudWatch Logs

---

## 🧠 ECS Fargate LLM Service

The service is defined in `infra/ecsService.ts` and includes:

* Docker image from config
* CPU/memory settings
* Environment variables (`API_KEY`, etc.)
* Security group rules
* Integration with subnets and optionally a Load Balancer

---

## 🛡️ Security

Pulumi handles secrets via its encrypted config backend. Do **not** hardcode API keys in code. Always use:

```bash
pulumi config set --secret key value
```

---

## 📚 References

* [Pulumi + AWS Docs](https://www.pulumi.com/docs/clouds/aws/)
* [AWS Fargate](https://docs.aws.amazon.com/AmazonECS/latest/userguide/what-is-fargate.html)
* [OpenAI API Reference](https://platform.openai.com/docs/api-reference)

---

## 📝 License

MIT License — free to use, modify, and distribute.

---

## ✨ Author

Built with ❤️ by [Tonny](https://github.com/tonny-dev)

```

Let me know if you want:
- Badge support (e.g. build status, license)
- GitHub Actions CI/CD section
- `.env` example generation
- Separate CONTRIBUTING.md or LICENSE file
```
