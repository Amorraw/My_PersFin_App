import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV } from "../config";

const envMap = {
  sandbox:     PlaidEnvironments.sandbox,
  development: PlaidEnvironments.development,
  production:  PlaidEnvironments.production,
};

const config = new Configuration({
  basePath: envMap[PLAID_ENV] ?? PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": PLAID_CLIENT_ID,
      "PLAID-SECRET":    PLAID_SECRET,
    },
  },
});

export const plaidClient = new PlaidApi(config);
