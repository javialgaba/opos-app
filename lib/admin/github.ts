import { promises as fs } from "node:fs";
import path from "node:path";

const ALLOWED_CONTENT_PREFIXES = ["content/oppositions/", "content/imported/"];

export function assertSafeContentPath(filePath: string) {
  const normalized = filePath.replaceAll("\\", "/");

  if (
    normalized.includes("..") ||
    !normalized.endsWith(".json") ||
    !ALLOWED_CONTENT_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  ) {
    throw new Error("Ruta de contenido no permitida.");
  }

  return normalized;
}

function getGitHubConfig() {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";

  if (!token || !owner || !repo) {
    return null;
  }

  return {
    token,
    owner,
    repo,
    branch
  };
}

async function saveViaGitHub(filePath: string, content: string) {
  const config = getGitHubConfig();

  if (!config) {
    return null;
  }

  const endpoint = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${filePath}`;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${config.token}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28"
  };

  const existingResponse = await fetch(`${endpoint}?ref=${config.branch}`, { headers });
  let sha: string | undefined;

  if (existingResponse.ok) {
    const existing = (await existingResponse.json()) as { sha?: string };
    sha = existing.sha;
  } else if (existingResponse.status !== 404) {
    throw new Error(`GitHub no pudo leer el archivo: ${existingResponse.status}`);
  }

  const updateResponse = await fetch(endpoint, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: `Update ${filePath}`,
      content: Buffer.from(content, "utf8").toString("base64"),
      branch: config.branch,
      sha
    })
  });

  if (!updateResponse.ok) {
    const text = await updateResponse.text();
    throw new Error(`GitHub no pudo guardar el archivo: ${updateResponse.status} ${text}`);
  }

  return {
    mode: "github",
    branch: config.branch
  };
}

async function saveLocally(filePath: string, content: string) {
  if (process.env.ALLOW_LOCAL_CONTENT_WRITES !== "true") {
    throw new Error(
      "No hay configuración de GitHub y ALLOW_LOCAL_CONTENT_WRITES no está activado."
    );
  }

  const absolutePath = path.join(process.cwd(), filePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");

  return {
    mode: "local",
    branch: null
  };
}

export async function saveContentFile(filePathInput: string, content: string) {
  const filePath = assertSafeContentPath(filePathInput);
  const githubResult = await saveViaGitHub(filePath, content);

  if (githubResult) {
    return githubResult;
  }

  return saveLocally(filePath, content);
}
