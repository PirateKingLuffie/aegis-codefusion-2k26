import template from "@/datasets/faridabad/eit-campus-import.example.json";

export const dynamic = "force-static";

export async function GET(): Promise<Response> {
  return Response.json(template, {
    headers: {
      "Cache-Control": "public, max-age=86400",
      "Content-Disposition": "attachment; filename=eit-campus-import.example.json",
    },
  });
}
