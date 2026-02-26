const path = require('path');
const cdk = require('aws-cdk-lib');
const cloudfront = require('aws-cdk-lib/aws-cloudfront');
const origins = require('aws-cdk-lib/aws-cloudfront-origins');
const iam = require('aws-cdk-lib/aws-iam');
const lambda = require('aws-cdk-lib/aws-lambda');
const logs = require('aws-cdk-lib/aws-logs');
const s3 = require('aws-cdk-lib/aws-s3');
const s3deploy = require('aws-cdk-lib/aws-s3-deployment');

class LlmLogprobDashboardStack extends cdk.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const openAiApiKeyParam = new cdk.CfnParameter(this, 'OpenAiApiKey', {
      type: 'String',
      noEcho: true,
      description: 'OpenAI API key used by Lambda backend'
    });
    const openAiModelParam = new cdk.CfnParameter(this, 'OpenAiModel', {
      type: 'String',
      default: 'gpt-4o-mini',
      description: 'OpenAI model id'
    });
    const topLogprobsParam = new cdk.CfnParameter(this, 'TopLogprobs', {
      type: 'Number',
      default: 5,
      minValue: 0,
      maxValue: 20,
      description: 'How many top_logprobs candidates to request per token'
    });

    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const apiFunction = new lambda.Function(this, 'ApiFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'api-handler.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda')),
      timeout: cdk.Duration.seconds(20),
      memorySize: 512,
      logGroup: new logs.LogGroup(this, 'ApiFunctionLogGroup', {
        retention: logs.RetentionDays.ONE_DAY,
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
      environment: {
        OPENAI_API_KEY: openAiApiKeyParam.valueAsString,
        OPENAI_MODEL: openAiModelParam.valueAsString,
        TOP_LOGPROBS: topLogprobsParam.valueAsString
      }
    });

    const functionUrl = apiFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED
      },
      additionalBehaviors: {
        'api/*': {
          origin: origins.FunctionUrlOrigin.withOriginAccessControl(functionUrl),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy:
            cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER
        }
      }
    });

    const cloudFrontDistributionArn = `arn:${cdk.Aws.PARTITION}:cloudfront::${cdk.Aws.ACCOUNT_ID}:distribution/${distribution.distributionId}`;
    apiFunction.addPermission('AllowCloudFrontInvokeFunction', {
      principal: new iam.ServicePrincipal('cloudfront.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: cloudFrontDistributionArn,
      invokedViaFunctionUrl: true
    });

    new s3deploy.BucketDeployment(this, 'DeployFrontend', {
      destinationBucket: siteBucket,
      sources: [s3deploy.Source.asset(path.join(__dirname, '..', 'public'))],
      distribution,
      distributionPaths: ['/*']
    });

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`
    });
    new cdk.CfnOutput(this, 'FunctionUrl', {
      value: functionUrl.url
    });
    new cdk.CfnOutput(this, 'ApiRoute', {
      value: `https://${distribution.distributionDomainName}/api/generate`
    });
  }
}

module.exports = { LlmLogprobDashboardStack };
