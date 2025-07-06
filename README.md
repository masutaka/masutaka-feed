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
        G[EventBridge Scheduler<br/>every 5 minutes] -->|1: trigger| H[Feed Subscriber Lambda]
        H -.->|3: read/write| I[(DynamoDB)]
        H -->|4: invoke| D[Notifier Lambda]
    end

    E[Mastodon]
    F[Pushover]

    A -.->|2: pull| H
    D -->|5: filtered post| E
    D -->|6: filtered post| F
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
        H -->|4: invoke| D[Notifier Lambda]
    end

    E[Mastodon]

    A -.->|2: pull| H
    D -->|5: post| E
```

## Deployment

Every push to the `main` branch will deploy SAM Applications.
