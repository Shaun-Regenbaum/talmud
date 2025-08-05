# AWS Account Cleanup and Organization Requirements

## Current Situation
- 3 AWS accounts in an organization (Shaun, Lior, Nicolas)
- 3 developers using AWS without proper controls
- No proper logging setup (CloudTrail is empty)
- No clear visibility into resources across accounts
- Cost management concerns
- IAM users without MFA or proper permissions structure

## Required Tasks

### 1. Discovery & Audit
- [ ] Map all AWS accounts and their purposes
- [ ] Audit all resources across all accounts and regions
- [ ] Check IAM users, roles, and permissions in each account
- [ ] Review current costs and identify waste
- [ ] Check for security vulnerabilities (exposed resources, old access keys, etc.)
- [ ] Document all running services and their purposes

### 2. Security & Compliance
- [ ] Enable CloudTrail in all accounts with centralized logging
- [ ] Set up MFA for all IAM users
- [ ] Rotate old access keys (anything >90 days)
- [ ] Remove unused IAM users and roles
- [ ] Implement least privilege access policies
- [ ] Enable GuardDuty for threat detection
- [ ] Set up AWS Config for compliance monitoring

### 3. Cost Optimization
- [ ] Identify and terminate unused resources:
  - Stopped EC2 instances
  - Unattached EBS volumes
  - Unused Elastic IPs
  - Old snapshots
  - Unused load balancers
- [ ] Set up billing alerts and budgets
- [ ] Enable Cost Explorer and analyze spending patterns
- [ ] Tag resources properly for cost allocation
- [ ] Consider Reserved Instances for long-running workloads

### 4. Organization & Access Management
- [ ] Set up proper OU (Organizational Unit) structure
- [ ] Implement Service Control Policies (SCPs)
- [ ] Create cross-account roles for access instead of multiple users
- [ ] Set up SSO if possible for centralized access
- [ ] Document who has access to what and why

### 5. Resource Management
- [ ] Create a resource inventory across all accounts
- [ ] Implement consistent naming conventions
- [ ] Set up proper tagging strategy (Owner, Project, Environment, etc.)
- [ ] Create cleanup scripts for regular maintenance
- [ ] Document critical vs non-critical resources

### 6. Monitoring & Alerts
- [ ] Set up CloudWatch dashboards for key metrics
- [ ] Create billing alerts at multiple thresholds
- [ ] Set up notifications for unusual activity
- [ ] Monitor for compliance violations
- [ ] Create runbooks for common issues

## Deliverables Needed

1. **Audit Reports**
   - Current state of all accounts
   - Security findings and risks
   - Cost analysis and savings opportunities
   - Resource inventory

2. **Cleanup Scripts**
   - Safe resource cleanup scripts
   - IAM audit and cleanup tools
   - Cost optimization automation

3. **Documentation**
   - Account structure and purpose
   - Access control matrix
   - Resource ownership mapping
   - Standard operating procedures

4. **Implementation Plan**
   - Prioritized list of fixes
   - Quick wins vs long-term improvements
   - Risk assessment for each change

## Key Information Needed
- Which account is the master/management account?
- What are the primary workloads in each account?
- Which resources are production vs development?
- What's the monthly budget target?
- Who should have access to what?

## Safety Considerations
- Always confirm before deleting resources
- Check dependencies before removal
- Backup critical data first
- Test changes in dev environment first
- Keep audit trail of all changes