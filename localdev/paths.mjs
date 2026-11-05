// Where the neighbouring repos are, worked out from this file rather than written in, so localdev runs under
// any Windows login. The layout is the one on the first PC: MannaHRM, Manna_CMMS and SALES_DASHBOARD side by side
// in one folder. A PC that keeps them elsewhere sets MANNA_CMMS_DIR / SALES_DASHBOARD_DIR instead.

import path from "node:path";
import { fileURLToPath } from "node:url";

export const LOCALDEV = path.dirname(fileURLToPath(import.meta.url));
const MANNA = path.resolve(LOCALDEV, "..", "..");

export const CMMS = process.env.MANNA_CMMS_DIR || path.join(MANNA, "Manna_CMMS");
export const SALES_DASHBOARD = process.env.SALES_DASHBOARD_DIR || path.join(MANNA, "SALES_DASHBOARD");
export const CMMS_ENV = path.join(CMMS, "server", ".env");
export const TEST_LOGINS = path.join(LOCALDEV, "TEST_LOGINS.md");
