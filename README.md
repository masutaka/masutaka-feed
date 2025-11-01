# masutaka-feed

[![Test](https://github.com/masutaka/masutaka-feed/actions/workflows/test.yml/badge.svg?branch=main)][Test]
[![Deploy - GitHub Actions](https://github.com/masutaka/masutaka-feed/actions/workflows/deploy.yml/badge.svg?branch=main)][Deploy]
[![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/masutaka/masutaka-feed)][CodeRabbit]
[![Ask DeepWiki](https://deepwiki.com/badge.svg)][deepwiki]

[Test]: https://github.com/masutaka/masutaka-feed/actions/workflows/test.yml?query=branch%3Amain
[Deploy]: https://github.com/masutaka/masutaka-feed/actions/workflows/deploy.yml?query=branch%3Amain
[CodeRabbit]: https://www.coderabbit.ai/
[DeepWiki]: https://deepwiki.com/masutaka/masutaka-feed

A serverless application that posts personal GitHub activities and Hatena Bookmark favorites to Mastodon and Pushover (partial for Pushover).

## Features

### github/

```mermaid
graph TD
    subgraph "Data Source"
        A[/GitHub private feed/]
    end

    subgraph "AWS Infrastructure"
        direction LR
        G[EventBridge Scheduler<br/>every 5 minutes] -->|1: trigger| H[Feed Subscriber Lambda]
        H -.->|3: read/write| I[(DynamoDB)]
        H -->|4: invoke<br/>if new items| D[Notifier Lambda]
    end

    E[Mastodon]
    F[Pushover]

    A -.->|2: pull| H
    D -->|5: filtered post| E
    D -->|5: filtered post| F
```

### hatebu/

```mermaid
graph TD
    subgraph "Data Source"
        A[/はてブのお気に入り feed/]
    end

    subgraph "AWS Infrastructure"
        direction LR
        G[EventBridge Scheduler<br/>every 15 minutes] -->|1: trigger| H[Feed Subscriber Lambda]
        H -.->|3: read/write| I[(DynamoDB)]
        H -->|4: invoke<br/>if new items| D[Notifier Lambda]
    end

    E[Mastodon]

    A -.->|2: pull| H
    D -->|5: post| E
```

## CI/CD (GitHub Actions)

### Test Workflow
- **Trigger**: Push to main branch, Pull Requests
- **Actions**:
  - actionlint: Validate GitHub Actions configuration
  - CodeQL: Security vulnerability scanning
  - lint: TypeScript and ESLint static analysis (`make setup lint`)
  - Pushover notification on failure (main branch only)

### Deploy Workflow
- **Trigger**: After test workflow success (main branch only)
- **Authentication**: AWS OIDC for secure access
- **Deploy**: `make deploy` to deploy SAM application
- **Region**: ap-northeast-1 (Tokyo)

### Other Workflows
- **dependency_review**: Check for dependency vulnerabilities on PRs
- **schedule**: Weekly CodeQL analysis (Friday 19:00 JST)
