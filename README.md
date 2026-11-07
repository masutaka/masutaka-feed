# masutaka-feed

[![Test](https://github.com/masutaka/masutaka-feed/actions/workflows/test.yml/badge.svg?branch=main)][Test]
[![Deploy - GitHub Actions](https://github.com/masutaka/masutaka-feed/actions/workflows/deploy.yml/badge.svg?branch=main)][Deploy]
[![Ask DeepWiki](https://deepwiki.com/badge.svg)][deepwiki]

[Test]: https://github.com/masutaka/masutaka-feed/actions/workflows/test.yml?query=branch%3Amain
[Deploy]: https://github.com/masutaka/masutaka-feed/actions/workflows/deploy.yml?query=branch%3Amain
[DeepWiki]: https://deepwiki.com/masutaka/masutaka-feed

個人の GitHub のアクティビティと、はてなブックマークのお気に入りを Mastodon に投稿するサーバーレスアプリケーション。

## github/

タイトルが `GH_TITLE_PUSHOVER_REGEXP` に一致するアクティビティは、Pushover にも送る。

```mermaid
graph TD
    subgraph "データソース"
        A[/GitHub のプライベートフィード/]
    end

    subgraph "AWS"
        direction LR
        G[EventBridge Scheduler<br/>5分ごと] -->|1: 起動| H[Feed Subscriber Lambda]
        H -.->|3: 読み書き| I[(DynamoDB)]
        H -->|4: 新着があれば<br/>送信| Q[[SQS FIFO キュー]]
        Q -->|5: 起動| D[Notifier Lambda]
        Q -.->|失敗が続いたら| X[[デッドレターキュー]]
    end

    E[Mastodon]
    F[Pushover]

    A -.->|2: 取得| H
    D -->|6: 絞り込んで投稿| E
    D -->|6: 絞り込んで投稿| F
```

## hatebu/

```mermaid
graph TD
    subgraph "データソース"
        A[/はてブのお気に入りフィード/]
    end

    subgraph "AWS"
        direction LR
        G[EventBridge Scheduler<br/>15分ごと] -->|1: 起動| H[Feed Subscriber Lambda]
        H -.->|3: 読み書き| I[(DynamoDB)]
        H -->|4: 新着があれば<br/>送信| Q[[SQS FIFO キュー]]
        Q -->|5: 起動| D[Notifier Lambda]
        Q -.->|失敗が続いたら| X[[デッドレターキュー]]
    end

    E[Mastodon]

    A -.->|2: 取得| H
    D -->|6: 投稿| E
```
