'use strict';

let Promise = require('bluebird'),
  urlParser = require('url'),
  fs = require('fs'),
  webserver = require('./webserver'),
  path = require('path');

Promise.promisifyAll(fs);


function getScript(ruleFileName, category) {
  const domPath = path.resolve(__dirname, '..', '..', 'lib', 'dom'),
    utilPath = path.resolve(domPath, 'util.js'),
    utilScript = fs.readFileAsync(utilPath, 'utf8'),
    rulePath = path.resolve(domPath, category, ruleFileName),
    ruleScript = fs.readFileAsync(rulePath, 'utf8');

  return Promise.join(
    utilScript,
    ruleScript,
    (utilScript, ruleScript) => utilScript + ' return ' + ruleScript
  );
}

module.exports = {
  async createTestRunner(browser, category, useHttp2) {
    function run(url, script) {
      return Promise.resolve(script).then(script =>
        runner
          .loadAndWait(url, 'return window.performance.timing.loadEventEnd>0')
          .then(() => runner.runScript(script))
      );
    }

    const config = {
      browser: browser,
      timeouts: {
        browserStart: 60000
      }
    }

    if (process.env.CI) {
      config.xvfb = true
    }

    const  { BrowsertimeEngine } = await import('browsertime');
    const runner = new BrowsertimeEngine(config
    );

    let baseUrl;

    return {
      start() {
        return webserver
          .startServer(useHttp2)
          .then(address => {
            baseUrl = urlParser.format({
              protocol: useHttp2 ? 'https' : 'http',
              hostname: address.address,
              port: address.port
            });
          })
          .then(() => runner.start());
      },
      async stop() {
        try {
          await runner.stop();
        } finally {
          webserver.stopServer();
        }
      },
      runGlobalServer(ruleFileName, url) {
        const script = getScript(ruleFileName, category);
        return run(url, script);
      },
      run(ruleFileName, testPage) {
        if (!testPage) {
          testPage = path.basename(ruleFileName, '.js') + '.html';
        }

        const url = urlParser.resolve(baseUrl, category + '/' + testPage),
          script = getScript(ruleFileName, category);

        return run(url, script);
      }
    };
  }
};
