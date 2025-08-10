# Security Guidelines

## API Key Protection

This project has automated security measures to prevent API key leaks:

### Pre-commit Hook
A git pre-commit hook automatically scans all staged files for potential API keys and secrets before allowing commits. The hook will block commits if it detects:

- OpenRouter API keys (`sk-or-v1-...`)
- OpenAI API keys (`sk-...`)
- GitHub tokens (`ghp_...`, `ghs_...`)
- AWS credentials
- Google API keys
- And other common API key patterns

### Setup
The pre-commit hook is automatically configured when you clone this repository. To ensure it's active:

```bash
# Configure git to use our hooks
git config core.hooksPath .githooks

# Make sure the hook is executable
chmod +x .githooks/pre-commit
```

### Environment Variables
Never hardcode API keys in your code. Instead, use environment variables:

1. **For local development**: Create a `.dev.vars` file (already in .gitignore)
   ```
   OPENROUTER_API_KEY=your-key-here
   SCRAPINGBEE_API_KEY=your-key-here
   ```

2. **For production**: Set environment variables in `wrangler.toml` (not committed)
   ```toml
   [vars]
   OPENROUTER_API_KEY = "your-key-here"
   SCRAPINGBEE_API_KEY = "your-key-here"
   ```

### If a Key is Leaked
If an API key is accidentally committed:

1. **Immediately revoke the key** at the provider's dashboard
2. Generate a new key
3. Remove the commit from history:
   ```bash
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch path/to/file" \
     --prune-empty --tag-name-filter cat -- --all
   ```
4. Force push to all remotes (coordinate with team)

### Testing the Hook
To test if the pre-commit hook is working:

```bash
# This should fail and show a warning
echo 'API_KEY="sk-or-v1-[REDACTED-EXAMPLE-KEY]"' > test.js
git add test.js
git commit -m "Test"

# Clean up
git reset HEAD test.js
rm test.js
```

### Bypassing the Hook (Emergency Only)
If you absolutely need to bypass the hook (NOT RECOMMENDED):

```bash
git commit --no-verify
```

Only do this if you're certain there are no secrets in your code and the detection is a false positive.

## Additional Security Best Practices

1. **Regular Key Rotation**: Rotate API keys regularly
2. **Least Privilege**: Use API keys with minimal required permissions
3. **Monitor Usage**: Check API key usage logs for anomalies
4. **Use Secrets Management**: Consider using a proper secrets management service for production
5. **Review Dependencies**: Regularly audit npm dependencies for vulnerabilities

## Reporting Security Issues

If you discover a security vulnerability, please email security@example.com instead of opening a public issue.