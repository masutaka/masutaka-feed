/**
 * pushover-notifications パッケージの TypeScript ラッパー
 * 
 * pushover-notifications は JavaScript で書かれており型定義がないため、
 * このファイルで型安全性を提供します。
 */

/**
 * Pushover クライアントの初期化設定
 */
interface PushoverConfig {
  user?: string;
  token?: string;
}

/**
 * Pushover 通知メッセージの構造
 * @see https://pushover.net/api
 */
interface PushoverMessage {
  title: string;
  message: string;
  device?: string;
  priority?: number;
  sound?: string;
}

/**
 * pushover-notifications ライブラリのクラス定義
 * 実際の実装は require で読み込まれる JavaScript モジュール
 */
declare class PushoverClass {
  constructor(config: PushoverConfig);
  send(message: PushoverMessage): Promise<any>;
}

/**
 * 型付けされた Pushover クライアント
 * CommonJS モジュールを TypeScript で安全に使用するためのラッパー
 */
export const Pushover = require('pushover-notifications') as typeof PushoverClass;
