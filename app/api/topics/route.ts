import { NextResponse } from "next/server";
import { z } from "zod";
import { generateTopics } from "@/lib/topicEngine";

const payloadSchema = z.object({
  profile: z.object({
    name: z.string(),
    description: z.string(),
    idealCustomer: z.string(),
    tone: z.string(),
    keywords: z.string(),
    websiteUrl: z.string().url().nullable().optional()
  })
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = payloadSchema.parse(json);
    const topics = await generateTopics({
      ...parsed.profile,
      websiteUrl: parsed.profile.websiteUrl ?? ""
    });
    return NextResponse.json({ topics });
  } catch (error) {
    console.error("[topics] failed", error);
    return NextResponse.json(
      {
        error: "Unable to generate topics",
        detail: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
