# masutaka-feed

[![Test](https://github.com/masutaka/masutaka-feed/actions/workflows/test.yml/badge.svg?branch=main)][Test]
[![Deploy - GitHub Actions](https://github.com/masutaka/masutaka-feed/actions/workflows/deploy.yml/badge.svg?branch=main)][deploy]

[Test]: https://github.com/masutaka/masutaka-feed/actions/workflows/test.yml?query=branch%3Amain
[deploy]: https://github.com/masutaka/masutaka-feed/actions/workflows/deploy.yml?query=branch%3Amain

## Features

### github/

```mermaid
graph TD
    subgraph "Data Source"
        A[/GitHub private feed/]
    end

    subgraph "AWS Infrastructure"
        direction LR
        G[EventBridge Scheduler<br/>every 5 minutes] -->|trigger| H[Feed Subscriber Lambda]
        H -.->|read/write| I[(DynamoDB)]
        H -->|invoke| D[Notifier Lambda]
    end

    E[Mastodon]
    F[Pushover]

    A -.->|pull| H
    D -->|filtered post| E
    D -->|filtered post| F
```

### hatebu/

```mermaid
graph TD
    subgraph "Data Source"
        A[/はてブのお気に入り feed/]
    end

    subgraph "AWS Infrastructure"
        direction LR
        G[EventBridge Scheduler<br/>every 15 minutes] -->|trigger| H[Feed Subscriber Lambda]
        H -.->|read/write| I[(DynamoDB)]
        H -->|invoke| D[Notifier Lambda]
    end

    E[Mastodon]

    A -.->|pull| H
    D -->|post| E
```

## Deployment

Every push to the `main` branch will deploy SAM Applications.
