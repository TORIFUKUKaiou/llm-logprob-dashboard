#!/usr/bin/env node
const cdk = require('aws-cdk-lib');
const { LlmLogprobDashboardStack } = require('../lib/llm-logprob-dashboard-stack');

const app = new cdk.App();

new LlmLogprobDashboardStack(app, 'LlmLogprobDashboardStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
});
