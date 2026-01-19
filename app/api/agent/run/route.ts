import { NextResponse } from "next/server";
import { z } from "zod";
import { generateBlogPost, dispatchToChannel } from "@/lib/blogAgent";
import type { BlogTopic } from "@/lib/types";

const payloadSchema = z.object({
  profile: z.object({
    name: z.string(),
    description: z.string(),
    idealCustomer: z.string(),
    tone: z.string(),
    keywords: z.string(),
    websiteUrl: z.string()
  }),
  topic: z.object({
    id: z.string(),
    title: z.string(),
    angle: z.string(),
    audience: z.string(),
    keywords: z.array(z.string()),
    score: z.number().optional()
  }),
  channel: z
    .object({
      id: z.string(),
      type: z.enum(["wordpress", "webhook"]),
      name: z.string(),
      endpointUrl: z.string().url(),
      username: z.string().optional(),
      appPassword: z.string().optional(),
      headers: z.record(z.string()).optional()
    })
    .optional()
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const input = payloadSchema.parse(json);
    const topic: BlogTopic = {
      id: input.topic.id,
      title: input.topic.title,
      angle: input.topic.angle,
      audience: input.topic.audience,
      keywords: input.topic.keywords,
      score: input.topic.score ?? 0
    };

    const blog = await generateBlogPost(input.profile, topic);

    let dispatchResult: unknown = null;
    if (input.channel) {
      dispatchResult = await dispatchToChannel(input.channel, blog);
    }

    return NextResponse.json({
      success: true,
      blog,
      dispatchResult
    });
  } catch (error) {
    console.error("[agent-run] failed", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
