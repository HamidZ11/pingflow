import type { WhatsAppEnv } from "@/lib/whatsapp/config";

// Where a connection's access token comes from. The rest of the code asks
// this, never the environment.
//
// Today there is one source: the developer connection, whose token is the
// server's WHATSAPP_ACCESS_TOKEN. Customers' own numbers (Embedded Signup)
// will each have a business integration token; those need encrypted,
// server-only storage (for example Supabase Vault) behind this same
// interface. That isn't built: no customer token is stored anywhere yet.

export type ConnectionRef = {
  id: string;
  mode: "developer" | "embedded_signup";
  phoneNumberId: string;
};

export type WhatsAppCredentials = {
  accessToken: string;
  phoneNumberId: string;
};

export interface WhatsAppCredentialProvider {
  getCredentials(
    connection: ConnectionRef,
  ): Promise<WhatsAppCredentials | null>;
}

export class EnvironmentWhatsAppCredentialProvider implements WhatsAppCredentialProvider {
  constructor(private readonly env: WhatsAppEnv) {}

  async getCredentials(connection: ConnectionRef) {
    // Only for the developer connection to the configured number.
    if (
      connection.mode !== "developer" ||
      !this.env.accessToken ||
      this.env.phoneNumberId !== connection.phoneNumberId
    ) {
      return null;
    }
    return {
      accessToken: this.env.accessToken,
      phoneNumberId: connection.phoneNumberId,
    };
  }
}
