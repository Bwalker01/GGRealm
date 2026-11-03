import { defineRailway, github, project, service } from "railway/iac";
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "GGRealm";
export default defineRailway(() => {
  const GGRealm = service("GGRealm", {
    source: github("Bwalker01/GGRealm", { branch: "main", checkSuites: true }),
    build: { buildCommand: "npm run build", buildEnvironment: "V3", builder: "RAILPACK", watchPatterns: ["src/**", "package.json", "package-lock.json", "tsconfig.json", ".railway/**"] },
    start: "node dist/server.js",
    healthcheck: "/health",
    healthcheckTimeout: 60,
    replicas: { "europe-west4-drams3a": 1 },
    domains: ["api.ggrealm.com"],
    networking: { privateNetworkEndpoint: "ggrealm" },
  });

  return project("GGRealm", {
    // Missing from the SDK's types as of railway@3.16.0. but needs it at runtime.
    // @ts-expect-error
    variables: { managed: false },
    resources: [GGRealm],
  });
});
