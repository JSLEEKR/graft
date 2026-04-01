# A4-Specialist — v2.0-R3 (Score: 8)

## Domain Analysis
- Three-way namespace problem: ContextRef.context resolves against 3 tables
- Recommends unified namespace with declaration-time collision detection
- Comparison: GraphQL, Protobuf, Terraform all use unified namespace

## Key Proposal: checkDuplicateNames
- Memory vs context collision → error
- Memory vs produces collision → error  
- Must run BEFORE checkNodeReads (root cause first)
- Context > Memory > Produces ordering in estimator (data availability timeline)

## Proposed Changes
- ScopeChecker: memoryNames, memoryFieldsMap, checkDuplicateNames, checkNodeWrites, memory in reads
- TokenEstimator: memory branch between context and produces
- TypeChecker: NO CHANGES
- 11 test cases proposed
