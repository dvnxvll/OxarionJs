const MIN_VER = "1.2.19";

async function check_bun_version() {
  const exec = Bun.spawn(["bun", "-v"]);
  const get_ver = (await exec.stdout.text()).trim();

  if (!get_ver) {
    console.warn("Could not determine current Bun version.");
    return false;
  }

  if (Bun.semver.order(get_ver, MIN_VER) === -1) {
    console.warn(
      `[Oxarion] Bun version mismatch: minimum required is ${MIN_VER}, got ${get_ver}.\nUse 'bun upgrade' to upgrade to the latest version of Bun.`
    );
    return false;
  }

  return true;
}

export { check_bun_version };
