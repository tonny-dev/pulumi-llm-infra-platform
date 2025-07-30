#!/bin/bash

echo "🧪 Testing Pulumi LLM Infrastructure Platform"
echo "=============================================="

# Test TypeScript compilation
echo "📝 Testing TypeScript compilation..."
npm run build
if [ $? -eq 0 ]; then
    echo "✅ TypeScript compilation passed"
else
    echo "❌ TypeScript compilation failed"
    exit 1
fi

# Test infrastructure code
echo "🧪 Running infrastructure tests..."
npm test
if [ $? -eq 0 ]; then
    echo "✅ Infrastructure tests passed"
else
    echo "❌ Infrastructure tests failed"
    exit 1
fi

# Test Pulumi preview
echo "🔍 Testing Pulumi preview..."
pulumi preview
if [ $? -eq 0 ]; then
    echo "✅ Pulumi preview successful"
else
    echo "❌ Pulumi preview failed"
    exit 1
fi

# Test webapp build
echo "🌐 Testing webapp build..."
cd webapp && npm run build
if [ $? -eq 0 ]; then
    echo "✅ Webapp build successful"
    cd ..
else
    echo "❌ Webapp build failed"
    cd ..
    exit 1
fi

echo ""
echo "🎉 All tests passed! Infrastructure is ready for deployment."
echo ""
echo "Next steps:"
echo "1. Update AWS IAM permissions using aws-permissions-policy.json"
echo "2. Run: pulumi up --yes"
echo "3. Access your infrastructure via AWS console"
