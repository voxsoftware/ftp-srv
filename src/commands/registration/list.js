const _ = require('lodash');
const when = require('when');
const getFileStat = require('../../helpers/file-stat');

// http://cr.yp.to/ftp/list.html
// http://cr.yp.to/ftp/list/eplf.html
module.exports = {
  directive: 'LIST',
  handler: function ({log, command} = {}) {
    if (!this.fs) return this.reply(550, 'File system not instantiated');
    if (!this.fs.get) return this.reply(402, 'Not supported by file system');
    if (!this.fs.list) return this.reply(402, 'Not supported by file system');

    const simple = command.directive === 'NLST';

    const path = command.arg || '.';
    return this.connector.waitForConnection()
    .tap(() => this.commandSocket.pause())
    .then(() => when.try(this.fs.get.bind(this.fs), path))
    .then(stat => stat.isDirectory() ? when.try(this.fs.list.bind(this.fs), path) : [stat])
    .then(files => {
      const getFileMessage = file => {
        if (simple) return file.name;
        return getFileStat(file, _.get(this, 'server.options.file_format', 'ls'));
      };

      const fileList = files.map(file => {
        const message = getFileMessage(file);
        return {
          raw: true,
          message,
          socket: this.connector.socket
        };
      });
      return this.reply(150)
      .then(() => {
        if (fileList.length) return this.reply({}, ...fileList);
      });
    })
    .then(() => {
      return this.reply(226, 'Transfer OK');
    })
    .catch(when.TimeoutError, err => {
      log.error(err);
      return this.reply(425, 'No connection established');
    })
    .catch(err => {
      log.error(err);
      return this.reply(451, err.message || 'No directory');
    })
    .finally(() => {
      this.connector.end();
      this.commandSocket.resume();
    });
  },
  syntax: '{{cmd}} [<path>]',
  description: 'Returns information of a file or directory if specified, else information of the current working directory is returned'
};
