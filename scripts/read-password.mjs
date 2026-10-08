export function readPassword(prompt = 'Senha: ') {
  if (!process.stdin.isTTY) throw new Error('Defina ADMIN_PASSWORD no ambiente');
  return new Promise((resolve, reject) => {
    let value = '';
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    const finish = () => {
      process.stdin.off('data', receive);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    const receive = (chunk) => {
      for (const char of chunk) {
        if (char === '\u0003') {
          finish();
          reject(new Error('Cancelado'));
          return;
        }
        if (char === '\r' || char === '\n') {
          finish();
          resolve(value);
          return;
        }
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        if (char >= ' ') value += char;
      }
    };
    process.stdin.on('data', receive);
  });
}
