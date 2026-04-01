import Oxarion, { Middleware } from "../../../src/index.ts";

const port = Number(Bun.env.OX_TEST_PORT || 9090);
const host = Bun.env.OX_TEST_HOST || "0.0.0.0";

Oxarion.start({
  port,
  host,
  checkLatestVersion: false,
  template: {
    pagesDir: "pages",
    fragmentsDir: "fragments",
    cache: true,
  },
  dynamicRouting: {
    dir: "dyn",
  },
  httpHandler: (router) => {
    const ox_script_path = router.serveOx();

    router.addHandler("GET", "/", (req, res) => {
      const count = Number(req.getSessionValue("count") || 0);
      return res.render("index", {
        count,
        csrfToken: req.getCsrfToken(),
        oxScriptPath: ox_script_path,
      });
    });

    router.addHandler("POST", "/fragments/counter/increment", (req, res) => {
      const count = Number(req.getSessionValue("count") || 0) + 1;
      req.setSessionValue("count", count);
      return res.renderFragment("counter", { count });
    });

    router.addHandler("POST", "/fragments/counter/reset", (req, res) => {
      req.setSessionValue("count", 0);
      return res.renderFragment("counter", { count: 0 });
    });
  },
  safeMwRegister: (router) => {
    router.multiMiddleware(
      "/",
      [
        Middleware.session({
          cookieName: "ox_counter_session",
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          rolling: true,
        }),
        Middleware.csrf(),
      ],
      true,
    );
  },
});
