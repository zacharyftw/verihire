/**
 * VeriHire Code Execution Server
 * Lightweight HTTP server that executes code in the sandbox Docker container.
 * Replaces Judge0 with a simpler, more flexible approach.
 */

const http = require('http');
const { execSync, spawn } = require('child_process');

const PORT = process.env.PORT || 9090;
const SANDBOX_IMAGE = process.env.SANDBOX_IMAGE || 'verihire-sandbox';
const TIMEOUT_SECONDS = parseInt(process.env.TIMEOUT || '10', 10);
const MEMORY_LIMIT = process.env.MEMORY_LIMIT || '256m';

// Language → command mapping
const LANGUAGE_COMMANDS = {
  javascript: file => `node ${file}`,
  typescript: file => `tsx ${file}`,
  python: file => `python3 ${file}`,
  python3: file => `python3 ${file}`,
  java: file => `cd /code && javac ${file} && java -cp /code Main`,
  c: file => `gcc ${file} -o /code/a.out -lm && /code/a.out`,
  cpp: file => `g++ ${file} -o /code/a.out -std=c++17 && /code/a.out`,
  'c++': file => `g++ ${file} -o /code/a.out -std=c++17 && /code/a.out`,
  csharp: file => `dotnet-script ${file}`,
  go: file => `go run ${file}`,
  rust: file => `rustc ${file} -o /code/a.out 2>&1 && /code/a.out`,
  ruby: file => `ruby ${file}`,
  php: file => `php ${file}`,
  kotlin: file =>
    `kotlinc ${file} -include-runtime -d /code/out.jar 2>/dev/null && java -jar /code/out.jar`,
  scala: file => `scala ${file}`,
  bash: file => `bash ${file}`,
  shell: file => `bash ${file}`,
  perl: file => `perl ${file}`,
  lua: file => `lua5.4 ${file}`,
  r: file => `Rscript ${file}`,
  haskell: file => `runghc ${file}`,
  elixir: file => `elixir ${file}`,
  sql: file => `sqlite3 :memory: < ${file}`,
};

// File extensions
const EXTENSIONS = {
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  python3: 'py',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  csharp: 'cs',
  go: 'go',
  rust: 'rs',
  ruby: 'rb',
  php: 'php',
  kotlin: 'kt',
  scala: 'scala',
  bash: 'sh',
  shell: 'sh',
  perl: 'pl',
  lua: 'lua',
  r: 'R',
  haskell: 'hs',
  elixir: 'exs',
  sql: 'sql',
};

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

async function executeCode({ sourceCode, language, stdin, timeLimit, memoryLimit }) {
  const lang = (language || 'python').toLowerCase();
  const ext = EXTENSIONS[lang] || 'txt';
  const filename = lang === 'java' ? 'Main.java' : `solution.${ext}`;
  const cmd = LANGUAGE_COMMANDS[lang];

  if (!cmd) {
    return { stdout: '', stderr: `Unsupported language: ${lang}`, exitCode: 1, time: 0 };
  }

  const timeout = timeLimit || TIMEOUT_SECONDS;
  const memory = memoryLimit || MEMORY_LIMIT;
  const startTime = Date.now();

  try {
    // Write code to a temp file, pipe stdin, capture stdout/stderr
    const dockerCmd = [
      'docker',
      'run',
      '--rm',
      '-i',
      '--memory',
      memory,
      '--cpus',
      '1',
      '--network',
      'none',
      '--pids-limit',
      '64',
      '--read-only',
      '--tmpfs',
      '/code:rw,exec,size=64m',
      '--tmpfs',
      '/tmp:rw,size=32m',
      SANDBOX_IMAGE,
      'bash',
      '-c',
      `cat > /code/${filename} && timeout ${timeout} bash -c '${cmd(`/code/${filename}`)}'`,
    ];

    return new Promise(resolve => {
      const proc = spawn(dockerCmd[0], dockerCmd.slice(1), {
        timeout: (timeout + 5) * 1000,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', data => (stdout += data.toString()));
      proc.stderr.on('data', data => (stderr += data.toString()));

      // Send source code first, then stdin
      proc.stdin.write(sourceCode);
      if (stdin) {
        proc.stdin.write('\n---STDIN_SEPARATOR---\n');
      }
      proc.stdin.end();

      // Actually, we need to pipe code as file content and stdin separately
      // Let's use a different approach: embed code in the command
      proc.on('close', code => {
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code || 0,
          time: Date.now() - startTime,
        });
      });

      proc.on('error', err => {
        resolve({
          stdout: '',
          stderr: err.message,
          exitCode: 1,
          time: Date.now() - startTime,
        });
      });
    });
  } catch (err) {
    return {
      stdout: '',
      stderr: err.message || String(err),
      exitCode: 1,
      time: Date.now() - startTime,
    };
  }
}

// Better approach: write code via echo, pipe stdin separately
async function executeCodeV2({ sourceCode, language, stdin, timeLimit, memoryLimit }) {
  const lang = (language || 'python').toLowerCase();
  const ext = EXTENSIONS[lang] || 'txt';
  const filename = lang === 'java' ? 'Main.java' : `solution.${ext}`;
  const cmd = LANGUAGE_COMMANDS[lang];

  if (!cmd) {
    return { stdout: '', stderr: `Unsupported language: ${lang}`, exitCode: 1, time: 0 };
  }

  const timeout = timeLimit || TIMEOUT_SECONDS;
  const memory = memoryLimit || MEMORY_LIMIT;
  const startTime = Date.now();

  // Base64 encode the source code to avoid shell escaping issues
  const codeB64 = Buffer.from(sourceCode).toString('base64');

  const shellCmd = `echo '${codeB64}' | base64 -d > /code/${filename} && timeout ${timeout} bash -c '${cmd(`/code/${filename}`)}'`;

  const dockerArgs = [
    'run',
    '--rm',
    '-i',
    '--memory',
    memory,
    '--cpus',
    '1',
    '--network',
    'none',
    '--pids-limit',
    '64',
    '--tmpfs',
    '/code:rw,exec,size=64m',
    '--tmpfs',
    '/tmp:rw,size=32m',
    SANDBOX_IMAGE,
    'bash',
    '-c',
    shellCmd,
  ];

  return new Promise(resolve => {
    const proc = spawn('docker', dockerArgs, {
      timeout: (timeout + 5) * 1000,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => (stdout += data.toString()));
    proc.stderr.on('data', data => (stderr += data.toString()));

    // Pipe stdin to the process
    if (stdin) {
      proc.stdin.write(stdin);
    }
    proc.stdin.end();

    proc.on('close', code => {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code || 0,
        time: Date.now() - startTime,
      });
    });

    proc.on('error', err => {
      resolve({
        stdout: '',
        stderr: err.message,
        exitCode: 1,
        time: Date.now() - startTime,
      });
    });
  });
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200);
    return res.end(JSON.stringify({ status: 'ok', sandbox: SANDBOX_IMAGE }));
  }

  // List languages
  if (req.method === 'GET' && req.url === '/languages') {
    res.writeHead(200);
    return res.end(JSON.stringify(Object.keys(LANGUAGE_COMMANDS)));
  }

  // Execute code
  if (req.method === 'POST' && req.url === '/execute') {
    try {
      const body = await parseBody(req);
      const result = await executeCodeV2({
        sourceCode: body.source_code || body.sourceCode || '',
        language: body.language || 'python',
        stdin: body.stdin || '',
        timeLimit: body.time_limit || body.timeLimit,
        memoryLimit: body.memory_limit || body.memoryLimit,
      });
      res.writeHead(200);
      return res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // Batch execute (for test cases)
  if (req.method === 'POST' && req.url === '/execute/batch') {
    try {
      const body = await parseBody(req);
      const submissions = body.submissions || [];
      const results = [];

      for (const sub of submissions) {
        const result = await executeCodeV2({
          sourceCode: sub.source_code || sub.sourceCode || '',
          language: sub.language || body.language || 'python',
          stdin: sub.stdin || '',
          timeLimit: sub.time_limit || sub.timeLimit || body.time_limit,
          memoryLimit: sub.memory_limit || sub.memoryLimit || body.memory_limit,
        });
        results.push(result);
      }

      res.writeHead(200);
      return res.end(JSON.stringify({ results }));
    } catch (err) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`Execution server running on port ${PORT}`);
  console.log(`Sandbox image: ${SANDBOX_IMAGE}`);
  console.log(`Timeout: ${TIMEOUT_SECONDS}s, Memory: ${MEMORY_LIMIT}`);
  console.log(`Supported languages: ${Object.keys(LANGUAGE_COMMANDS).join(', ')}`);
});
