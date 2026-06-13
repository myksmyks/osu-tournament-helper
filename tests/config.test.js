const {
  config,
  findMissingEnv,
  validateConfigShape,
  validateStartupConfiguration,
} = require("../src/config");

describe("Configuration", () => {
  test("accepts the loaded config and required startup environment variables", () => {
    expect(() =>
      validateStartupConfiguration(config, {
        TOKEN: "token",
        OSU_IRC_USERNAME: "username",
        OSU_IRC_PASSWORD: "password",
      }),
    ).not.toThrow();
    expect(() => validateConfigShape(config)).not.toThrow();
  });

  test("reports missing or blank values without exposing configured values", () => {
    const env = {
      TOKEN: "token",
      CLIENT_ID: " ",
    };

    expect(
      findMissingEnv(["TOKEN", "CLIENT_ID", "OSU_IRC_USERNAME"], env),
    ).toEqual(["CLIENT_ID", "OSU_IRC_USERNAME"]);
    expect(() => validateStartupConfiguration(config, env)).toThrow(
      /OSU_IRC_USERNAME, OSU_IRC_PASSWORD/,
    );
  });
});
