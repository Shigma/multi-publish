const program = require('commander')
const Publisher = require('.')

program
  .usage('[options] [names...]')
  .option('-a, --all')
  .option('-1, --major')
  .option('-2, --minor')
  .option('-3, --patch')
  .option('-p, --publish')
  .parse(process.argv)

const publisher = new Publisher()
if (program.all) program.args = publisher.names

Publisher.bump({
  bumpFlag: program.major ? 'major' : program.minor ? 'minor' : 'patch'
})

if (program.publish) Publisher.publish()
