# masutaka-feed

[![Test](https://github.com/masutaka/masutaka-feed/actions/workflows/test.yml/badge.svg?branch=main)][Test]
[![Deploy - GitHub Actions](https://github.com/masutaka/masutaka-feed/actions/workflows/deploy.yml/badge.svg?branch=main)][Deploy]
[![Ask DeepWiki](https://deepwiki.com/badge.svg)][deepwiki]

[Test]: https://github.com/masutaka/masutaka-feed/actions/workflows/test.yml?query=branch%3Amain
[Deploy]: https://github.com/masutaka/masutaka-feed/actions/workflows/deploy.yml?query=branch%3Amain
[DeepWiki]: https://deepwiki.com/masutaka/masutaka-feed

個人の GitHub のアクティビティと、はてなブックマークのお気に入りを Mastodon に投稿するサーバーレスアプリケーション。

## github/

```mermaid
graph TD
    subgraph "データソース"
        A[/GitHub のプライベートフィード/]
        R[/GitHub/]
    end

    subgraph "AWS"
        direction LR
        G[EventBridge Scheduler<br/>5分ごと] -->|1: 起動| H[Feed Subscriber Lambda]
        H -.->|3: 読み書き| I[(DynamoDB)]
        H -->|4: 新着があれば<br/>送信| Q[[SQS FIFO キュー]]
        Q -->|5: 起動| D[Notifier Lambda]
        Q -.->|失敗が続いたら| X[[デッドレターキュー]]
        B[Amazon Bedrock<br/>Claude Haiku]
    end

    E[Mastodon]
    F[Pushover]

    A -.->|2: 取得| H
    D -.->|6: star, fork, public のイベントなら<br/>README を取得| R
    D -.->|7: 紹介文を生成| B
    D -->|8: 絞り込んで投稿| E
    D -->|8: 絞り込んで投稿| F
```

> [!NOTE]
> 「8: 絞り込んで投稿」の条件は次のとおり。
>
> - Mastodon: `GH_TITLE_IGNORE_REGEXP` か `GH_URL_IGNORE_REGEXP` に一致するものを除いて投稿する
> - Pushover: Mastodon に投稿したもののうち、タイトルが `GH_TITLE_PUSHOVER_REGEXP` に一致するものだけを送る
>
> これとは別に、PR のマージとリリースのイベントは投稿しない。
>
> star, fork, public のイベントの投稿には、README から生成した日本語の紹介文を添える。README の取得や紹介文の生成に失敗したら、紹介なしで投稿する。Pushover に送る内容は変えない。

## hatebu/

```mermaid
graph TD
    subgraph "データソース"
        A[/はてブのお気に入りフィード/]
        W[/ブックマークされた記事/]
    end

    subgraph "AWS"
        direction LR
        G[EventBridge Scheduler<br/>15分ごと] -->|1: 起動| H[Feed Subscriber Lambda]
        H -.->|3: 読み書き| I[(DynamoDB)]
        H -->|4: 新着があれば<br/>送信| Q[[SQS FIFO キュー]]
        Q -->|5: 起動| D[Notifier Lambda]
        Q -.->|失敗が続いたら| X[[デッドレターキュー]]
        B[Amazon Bedrock<br/>Claude Haiku]
    end

    E[Mastodon]

    A -.->|2: 取得| H
    D -.->|6: コメントがなければ<br/>記事を取得| W
    D -.->|7: 要約を生成| B
    D -->|8: 投稿| E
```

> [!NOTE]
> コメントのないブックマークの投稿には、記事から生成した日本語の要約を添える。記事の取得や要約の生成に失敗したら、要約なしで投稿する。

## デプロイ

main にマージすると、GitHub Actions が `make deploy` で `app` スタックをデプロイする。

GitHub Actions のデプロイ用 IAM role と OIDC provider は、`bootstrap.yaml` の `bootstrap` スタックで管理する。GitHub Actions のデプロイでは更新しないため、変更したらローカルから管理者権限で `make deploy-bootstrap` を実行する。
