export function createNpmSummary() {
  return { scope: "npm", status: "ready" };
}

// current lane: npm
export function npmTask() {
  return { scope: "npm", status: "ready" };
}
