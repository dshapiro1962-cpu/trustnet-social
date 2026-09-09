// Minimal declarations for the Deno globals the edge functions use, so that
// `Cannot find name` from tsc means a REAL undeclared identifier and not just
// "this is not Node". Nothing here describes behaviour — it exists purely so
// the type checker stops complaining about the runtime and starts complaining
// about our own mistakes.
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
};
