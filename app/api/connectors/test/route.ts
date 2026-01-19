import { NextResponse } from "next/server";
import { z } from "zod";
import axios from "axios";

const payloadSchema = z.object({
  channel: z.object({
    type: z.enum(["wordpress", "webhook"]),
    endpointUrl: z.string().url(),
    username: z.string().optional(),
    appPassword: z.string().optional(),
    headers: z.record(z.string()).optional()
  })
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const { channel } = payloadSchema.parse(json);

    if (channel.type === "wordpress") {
      if (!channel.username || !channel.appPassword) {
        throw new Error("WordPress requires username and application password");
      }

      const authToken = Buffer.from(`${channel.username}:${channel.appPassword}`, "utf8").toString("base64");
      const { data } = await axios.get(`${channel.endpointUrl}/wp-json/wp/v2/types/post`, {
        headers: {
          Authorization: `Basic ${authToken}`
        },
        timeout: 15000
      });

      return NextResponse.json({
        ok: true,
        details: {
          name: data?.name ?? "WordPress Site",
          description: data?.description ?? ""
        }
      });
    }

    const { status } = await axios.head(channel.endpointUrl, {
      headers: channel.headers,
      timeout: 15000,
      validateStatus: () => true
    });

    if (status >= 400) {
      throw new Error(`Webhook responded with status ${status}`);
    }

    return NextResponse.json({ ok: true, details: { status } });
  } catch (error) {
    console.error("[connector-test] failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
