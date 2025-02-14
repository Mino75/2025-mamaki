const { execSync } = require("child_process");
const fs = require("fs");

// Configuration directly in the script
let config = {
  dockerhub_username: "mino189", // Change to your DockerHub username
  app_name: "mamaki",
  version: "1.0.0"
};

// Function to increment the minor version (e.g., 1.0.0 → 1.1.0)
function incrementVersion(version) {
  let parts = version.split(".").map(Number);
  parts[1] += 1; // Increment minor version
  parts[2] = 0; // Reset patch version
  return parts.join(".");
}

// Extract values
const DOCKERHUB_USER = config.dockerhub_username;
const APP_NAME = config.app_name;
let VERSION = config.version;
const IMAGE_NAME = `${DOCKERHUB_USER}/${APP_NAME}`;
const IMAGE_TAG = `${IMAGE_NAME}:${VERSION}`;
const IMAGE_LATEST = `${IMAGE_NAME}:latest`;

try {
  console.log("🚀 Starting Docker build and push process...\n");

  // 1️⃣ Build the Docker image (using existing Dockerfile)
  console.log(`🔨 Building Docker image ${IMAGE_NAME}:${VERSION}...`);
  execSync(`docker build -t ${IMAGE_TAG} .`, { stdio: "inherit" });

  // 2️⃣ Tag the image as "latest"
  console.log(`🏷 Tagging image: ${IMAGE_LATEST}...`);
  execSync(`docker tag ${IMAGE_TAG} ${IMAGE_LATEST}`, { stdio: "inherit" });

  // 3️⃣ Log in to DockerHub
  console.log("🔑 Logging in to DockerHub...");
  execSync("docker login", { stdio: "inherit" });

  // 4️⃣ Push the image to DockerHub
  console.log(`📤 Pushing image: ${IMAGE_TAG}...`);
  execSync(`docker push ${IMAGE_TAG}`, { stdio: "inherit" });

  console.log(`📤 Pushing image: ${IMAGE_LATEST}...`);
  execSync(`docker push ${IMAGE_LATEST}`, { stdio: "inherit" });

  console.log("✅ Docker image pushed successfully!");

  // 5️⃣ Increment the version
  let newVersion = incrementVersion(VERSION);
  console.log(`🔄 Incrementing version: ${VERSION} → ${newVersion}`);

  // 6️⃣ Update the script with the new version
  config.version = newVersion;
  let newScriptContent = fs.readFileSync(__filename, "utf8").replace(
    `"version": "${VERSION}"`,
    `"version": "${newVersion}"`
  );
  fs.writeFileSync(__filename, newScriptContent, "utf8");

  console.log("✅ Script updated with new version!");
} catch (error) {
  console.error("❌ Error during Docker process:", error);
}
