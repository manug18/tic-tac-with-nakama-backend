// Minimal type stubs for the Nakama server-side TypeScript runtime (goja / ES2019).
// These cover only the APIs used in modules/tictactoe.ts.
declare namespace nkruntime {

  // ── Enums ──────────────────────────────────────────────────────────────────
  enum SortOrder {
    ASCENDING  = 0,
    DESCENDING = 1,
  }

  enum Operator {
    BEST        = 0,
    SET         = 1,
    INCREMENTAL = 2,
    DECREMENTAL = 3,
  }

  type ResetSchedule = string | null;
  namespace ResetSchedule {
    const NEVER: null;
  }

  // ── Core objects ───────────────────────────────────────────────────────────
  interface Context {
    env:            Record<string, string>;
    executionMode:  number;
    node:           string;
    version:        string;
    headers:        Record<string, string[]>;
    queryParams:    Record<string, string[]>;
    userId?:        string;
    username?:      string;
    vars?:          Record<string, string>;
    userSessionExp?: number;
    sessionId?:     string;
    clientIp?:      string;
    clientPort?:    string;
    matchId?:       string;
    matchNode?:     string;
    matchLabel?:    string;
    matchTickRate?: number;
  }

  interface Logger {
    debug(format: string, ...params: unknown[]): void;
    info (format: string, ...params: unknown[]): void;
    warn (format: string, ...params: unknown[]): void;
    error(format: string, ...params: unknown[]): void;
  }

  interface Presence {
    userId:    string;
    sessionId: string;
    username:  string;
    node:      string;
    status?:   string;
  }

  interface MatchMessage {
    sender:        Presence;
    persistence:   boolean;
    status:        string;
    opCode:        number;
    data:          Uint8Array;
    reliable:      boolean;
    receiveTimeMs: number;
  }

  interface MatchDispatcher {
    broadcastMessage(
      opCode:    number,
      data:      string | null,
      presences?: Presence[] | null,
      sender?:   Presence,
      reliable?: boolean,
    ): void;
    matchLabelUpdate(label: string): void;
    matchKick(presences: Presence[]): void;
  }

  // ── Leaderboard ────────────────────────────────────────────────────────────
  interface LeaderboardRecord {
    leaderboardId: string;
    ownerId:       string;
    username:      string;
    score:         number;
    subscore:      number;
    numScore:      number;
    rank:          number;
    createTime:    number;
    updateTime:    number;
    expiryTime:    number;
  }

  interface LeaderboardRecordList {
    records:      LeaderboardRecord[];
    ownerRecords: LeaderboardRecord[];
    nextCursor:   string;
    prevCursor:   string;
  }

  // ── Nakama server API ──────────────────────────────────────────────────────
  interface Nakama {
    leaderboardCreate(
      id:            string,
      authoritative: boolean,
      sortOrder:     SortOrder,
      operator:      Operator,
      resetSchedule: ResetSchedule,
      metadata:      object | null,
    ): void;

    leaderboardRecordWrite(
      id:        string,
      ownerId:   string,
      username:  string,
      score:     number,
      subscore?: number,
      operator?: Operator,
      metadata?: object,
    ): LeaderboardRecord;

    leaderboardRecordsList(
      id:       string,
      ownerIds: string[],
      limit:    number,
      cursor:   string | undefined,
      expiry:   number,
    ): LeaderboardRecordList;

    matchCreate(module: string, params?: Record<string, string>): string;
    binaryToString(b: Uint8Array): string;
    stringToBinary(s: string): Uint8Array;
  }

  // ── Matchmaker ─────────────────────────────────────────────────────────────
  interface MatchmakerEntry {
    presence:   Presence;
    partyId?:   string;
    properties: Record<string, boolean | number | string>;
  }

  // ── Match handler function types ───────────────────────────────────────────
  type MatchInitFunction<T> = (
    ctx:    Context,
    logger: Logger,
    nk:     Nakama,
    params: Record<string, string>,
  ) => { state: T; tickRate: number; label: string };

  type MatchJoinAttemptFunction<T> = (
    ctx:        Context,
    logger:     Logger,
    nk:         Nakama,
    dispatcher: MatchDispatcher,
    tick:       number,
    state:      T,
    presence:   Presence,
    metadata:   Record<string, string>,
  ) => { state: T; accept: boolean; rejectMessage?: string };

  type MatchJoinFunction<T> = (
    ctx:        Context,
    logger:     Logger,
    nk:         Nakama,
    dispatcher: MatchDispatcher,
    tick:       number,
    state:      T,
    presences:  Presence[],
  ) => { state: T };

  type MatchLeaveFunction<T> = (
    ctx:        Context,
    logger:     Logger,
    nk:         Nakama,
    dispatcher: MatchDispatcher,
    tick:       number,
    state:      T,
    presences:  Presence[],
  ) => { state: T };

  type MatchLoopFunction<T> = (
    ctx:        Context,
    logger:     Logger,
    nk:         Nakama,
    dispatcher: MatchDispatcher,
    tick:       number,
    state:      T,
    messages:   MatchMessage[],
  ) => { state: T } | null;

  type MatchTerminateFunction<T> = (
    ctx:          Context,
    logger:       Logger,
    nk:           Nakama,
    dispatcher:   MatchDispatcher,
    tick:         number,
    state:        T,
    graceSeconds: number,
  ) => { state: T };

  type MatchSignalFunction<T> = (
    ctx:        Context,
    logger:     Logger,
    nk:         Nakama,
    dispatcher: MatchDispatcher,
    tick:       number,
    state:      T,
    data:       string,
  ) => { state: T; data?: string };

  type MatchmakerMatchedFunction = (
    ctx:     Context,
    logger:  Logger,
    nk:      Nakama,
    matches: MatchmakerEntry[],
  ) => string | void;

  type RpcFunction = (
    ctx:     Context,
    logger:  Logger,
    nk:      Nakama,
    payload: string,
  ) => string;

  // ── Initializer ────────────────────────────────────────────────────────────
  interface Initializer {
    registerMatch<T>(
      name:     string,
      handlers: {
        matchInit:        MatchInitFunction<T>;
        matchJoinAttempt: MatchJoinAttemptFunction<T>;
        matchJoin:        MatchJoinFunction<T>;
        matchLeave:       MatchLeaveFunction<T>;
        matchLoop:        MatchLoopFunction<T>;
        matchTerminate:   MatchTerminateFunction<T>;
        matchSignal?:     MatchSignalFunction<T>;
      },
    ): void;
    registerMatchmakerMatched(fn: MatchmakerMatchedFunction): void;
    registerRpc(id: string, fn: RpcFunction): void;
  }

  type InitModule = (
    ctx:         Context,
    logger:      Logger,
    nk:          Nakama,
    initializer: Initializer,
  ) => void;
}
