"use strict";

/*
 * Copyright (C) MIKO LLC - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Nikolay Beketov, 12 2019
 *
 */

/* global PbxApi, globalTranslate, Resumable, globalRootUrl, UserMessage */
var mergingCheckWorker = {
  timeOut: 3000,
  timeOutHandle: '',
  errorCounts: 0,
  $progressBarLabel: $('#upload-progress-bar').find('.label'),
  fileID: null,
  isXML: false,
  initialize: function () {
    function initialize(fileID) {
      var isXML = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
      // Запустим обновление статуса провайдера
      mergingCheckWorker.fileID = fileID;
      mergingCheckWorker.isXML = isXML;
      mergingCheckWorker.restartWorker(fileID);
    }

    return initialize;
  }(),
  restartWorker: function () {
    function restartWorker() {
      window.clearTimeout(mergingCheckWorker.timeoutHandle);
      mergingCheckWorker.worker();
    }

    return restartWorker;
  }(),
  worker: function () {
    function worker() {
      PbxApi.BackupStatusUpload(mergingCheckWorker.fileID, mergingCheckWorker.cbAfterResponse);
      mergingCheckWorker.timeoutHandle = window.setTimeout(mergingCheckWorker.worker, mergingCheckWorker.timeOut);
    }

    return worker;
  }(),
  cbAfterResponse: function () {
    function cbAfterResponse(response) {
      if (mergingCheckWorker.errorCounts > 10) {
        mergingCheckWorker.$progressBarLabel.text(globalTranslate.bkp_UploadError);
        UserMessage.showError(globalTranslate.bkp_UploadError);
        window.clearTimeout(mergingCheckWorker.timeoutHandle);
      }

      if (response === undefined || Object.keys(response).length === 0) {
        mergingCheckWorker.errorCounts += 1;
        return;
      }

      if (response.status_upload === 'COMPLETE') {
        mergingCheckWorker.$progressBarLabel.text(globalTranslate.bkp_UploadComplete);

        if (mergingCheckWorker.isXML) {
          mergingCheckWorker.$progressBarLabel.text(globalTranslate.bkp_SettingsRestoredWaitReboot);
          PbxApi.SystemReboot();
        } else {
          window.location.reload();
        }
      } else if (response.status_upload !== undefined) {
        mergingCheckWorker.$progressBarLabel.text(globalTranslate.bkp_UploadProcessingFiles);
        mergingCheckWorker.errorCounts = 0;
      } else {
        mergingCheckWorker.errorCounts += 1;
      }
    }

    return cbAfterResponse;
  }()
};
var backupIndex = {
  $templateRow: $('#backup-template-row'),
  $dummy: $('#dummy-row'),
  $uploadButton: $('#uploadbtn'),
  $progressBar: $('#upload-progress-bar'),
  $progressBarLabel: $('#upload-progress-bar').find('.label'),
  $body: $('body'),
  resumable: null,
  initialize: function () {
    function initialize() {
      backupIndex.$progressBar.hide();
      PbxApi.BackupGetFilesList(backupIndex.cbBackupGetFilesListAfterResponse);
      backupIndex.$body.on('click', 'a.download', function (e) {
        e.preventDefault();
        var id = $(e.target).closest('a').attr('data-value');
        PbxApi.BackupDownloadFile(id);
      });
      backupIndex.$body.on('click', 'a.delete', function (e) {
        e.preventDefault();
        var id = $(e.target).closest('a').attr('data-value');
        PbxApi.BackupDeleteFile(id, backupIndex.cbAfterDeleteFile);
      });
      backupIndex.initializeResumable();
    }

    return initialize;
  }(),

  /**
   * Коллбек после удаления файла бекапа
   * @param response
   */
  cbAfterDeleteFile: function () {
    function cbAfterDeleteFile(response) {
      if (response) {
        window.location = "".concat(globalRootUrl, "backup/index");
      }
    }

    return cbAfterDeleteFile;
  }(),

  /**
   * Обработка ответа BackupGetFilesList
   * @param response
   */
  cbBackupGetFilesListAfterResponse: function () {
    function cbBackupGetFilesListAfterResponse(response) {
      backupIndex.$dummy.show();

      if (response.length === 0 || response === false) {
        setTimeout(function () {
          PbxApi.BackupGetFilesList(backupIndex.cbBackupGetFilesListAfterResponse);
        }, 3000);
        return;
      }

      backupIndex.$dummy.hide();
      $.each(response, function (key, value) {
        var $newRow = $("tr#".concat(value.id));

        if ($newRow.length > 0) {
          $newRow.remove();
        }

        $newRow = backupIndex.$templateRow.clone();
        $newRow.attr('id', value.id);
        $newRow.addClass('backupIndex-file');
        var arhDate = new Date(1000 * value.date);
        $newRow.find('.create-date').html(arhDate.toLocaleString());
        $newRow.find('.file-size').html("".concat(value.size, " MB"));

        if (value.pid.length + value.pid_recover.length > 0) {
          $newRow.find('a').each(function (index, obj) {
            $(obj).remove();
          });
          var percentOfTotal = 100 * (value.progress / value.total);
          $newRow.find('.status').html("<i class=\"spinner loading icon\"></i> ".concat(parseInt(percentOfTotal, 10), " %"));
          setTimeout(function () {
            PbxApi.BackupGetFilesList(backupIndex.cbBackupGetFilesListAfterResponse);
          }, 3000);
        } else {
          $newRow.find('a').each(function (index, obj) {
            $(obj).attr('href', $(obj).attr('href') + value.id);
            $(obj).attr('data-value', value.id);
          });
          $newRow.find('.status').html('<i class="archive icon"></i>');
        }

        $newRow.appendTo('#existing-backup-files-table');
      });
    }

    return cbBackupGetFilesListAfterResponse;
  }(),

  /**
   * Подключение обработчкика загрузки файлов по частям
   */
  initializeResumable: function () {
    function initializeResumable() {
      var r = new Resumable({
        target: PbxApi.backupUpload,
        testChunks: false,
        chunkSize: 30 * 1024 * 1024,
        maxFiles: 1,
        fileType: ['img', 'zip', 'xml']
      });
      r.assignBrowse(document.getElementById('uploadbtn'));
      r.on('fileSuccess', function (file, response) {
        console.debug('fileSuccess', file);
        var isXML = false;

        if (file.file !== undefined && file.file.type !== undefined) {
          isXML = file.file.type === 'text/xml';
        }

        backupIndex.checkStatusFileMerging(response, isXML);
        backupIndex.$uploadButton.removeClass('loading');
      });
      r.on('fileProgress', function (file) {
        console.debug('fileProgress', file);
      });
      r.on('fileAdded', function (file, event) {
        r.upload();
        console.debug('fileAdded', event);
      });
      r.on('fileRetry', function (file) {
        console.debug('fileRetry', file);
      });
      r.on('fileError', function (file, message) {
        console.debug('fileError', file, message);
      });
      r.on('uploadStart', function () {
        console.debug('uploadStart');
        backupIndex.$uploadButton.addClass('loading');
        backupIndex.$progressBar.show();
        backupIndex.$progressBarLabel.text(globalTranslate.bkp_UploadInProgress);
      });
      r.on('complete', function () {
        console.debug('complete');
      });
      r.on('progress', function () {
        console.debug('progress');
        backupIndex.$progressBar.progress({
          percent: 100 * r.progress()
        });
      });
      r.on('error', function (message, file) {
        console.debug('error', message, file);
        backupIndex.$progressBarLabel.text(globalTranslate.bkp_UploadError);
        backupIndex.$uploadButton.removeClass('loading');
        UserMessage.showError("".concat(globalTranslate.bkp_UploadError, "<br>").concat(message));
      });
      r.on('pause', function () {
        console.debug('pause');
      });
      r.on('cancel', function () {
        console.debug('cancel');
      });
    }

    return initializeResumable;
  }(),

  /**
   * Запуск процесса ожидания склеивания файла после загрузки на сервер
   *
   * @param response ответ функции /pbxcore/api/backup/upload
   */
  checkStatusFileMerging: function () {
    function checkStatusFileMerging(response, isXML) {
      if (response === undefined || PbxApi.tryParseJSON(response) === false) {
        UserMessage.showError("".concat(globalTranslate.bkp_UploadError));
        return;
      }

      var json = JSON.parse(response);

      if (json === undefined || json.data === undefined) {
        UserMessage.showError("".concat(globalTranslate.bkp_UploadError));
        return;
      }

      var fileID = json.data.backup_id;
      mergingCheckWorker.initialize(fileID, isXML);
    }

    return checkStatusFileMerging;
  }()
};
$(document).ready(function () {
  backupIndex.initialize();
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9CYWNrdXAvYmFja3VwLWluZGV4LmpzIl0sIm5hbWVzIjpbIm1lcmdpbmdDaGVja1dvcmtlciIsInRpbWVPdXQiLCJ0aW1lT3V0SGFuZGxlIiwiZXJyb3JDb3VudHMiLCIkcHJvZ3Jlc3NCYXJMYWJlbCIsIiQiLCJmaW5kIiwiZmlsZUlEIiwiaXNYTUwiLCJpbml0aWFsaXplIiwicmVzdGFydFdvcmtlciIsIndpbmRvdyIsImNsZWFyVGltZW91dCIsInRpbWVvdXRIYW5kbGUiLCJ3b3JrZXIiLCJQYnhBcGkiLCJCYWNrdXBTdGF0dXNVcGxvYWQiLCJjYkFmdGVyUmVzcG9uc2UiLCJzZXRUaW1lb3V0IiwicmVzcG9uc2UiLCJ0ZXh0IiwiZ2xvYmFsVHJhbnNsYXRlIiwiYmtwX1VwbG9hZEVycm9yIiwiVXNlck1lc3NhZ2UiLCJzaG93RXJyb3IiLCJ1bmRlZmluZWQiLCJPYmplY3QiLCJrZXlzIiwibGVuZ3RoIiwic3RhdHVzX3VwbG9hZCIsImJrcF9VcGxvYWRDb21wbGV0ZSIsImJrcF9TZXR0aW5nc1Jlc3RvcmVkV2FpdFJlYm9vdCIsIlN5c3RlbVJlYm9vdCIsImxvY2F0aW9uIiwicmVsb2FkIiwiYmtwX1VwbG9hZFByb2Nlc3NpbmdGaWxlcyIsImJhY2t1cEluZGV4IiwiJHRlbXBsYXRlUm93IiwiJGR1bW15IiwiJHVwbG9hZEJ1dHRvbiIsIiRwcm9ncmVzc0JhciIsIiRib2R5IiwicmVzdW1hYmxlIiwiaGlkZSIsIkJhY2t1cEdldEZpbGVzTGlzdCIsImNiQmFja3VwR2V0RmlsZXNMaXN0QWZ0ZXJSZXNwb25zZSIsIm9uIiwiZSIsInByZXZlbnREZWZhdWx0IiwiaWQiLCJ0YXJnZXQiLCJjbG9zZXN0IiwiYXR0ciIsIkJhY2t1cERvd25sb2FkRmlsZSIsIkJhY2t1cERlbGV0ZUZpbGUiLCJjYkFmdGVyRGVsZXRlRmlsZSIsImluaXRpYWxpemVSZXN1bWFibGUiLCJnbG9iYWxSb290VXJsIiwic2hvdyIsImVhY2giLCJrZXkiLCJ2YWx1ZSIsIiRuZXdSb3ciLCJyZW1vdmUiLCJjbG9uZSIsImFkZENsYXNzIiwiYXJoRGF0ZSIsIkRhdGUiLCJkYXRlIiwiaHRtbCIsInRvTG9jYWxlU3RyaW5nIiwic2l6ZSIsInBpZCIsInBpZF9yZWNvdmVyIiwiaW5kZXgiLCJvYmoiLCJwZXJjZW50T2ZUb3RhbCIsInByb2dyZXNzIiwidG90YWwiLCJwYXJzZUludCIsImFwcGVuZFRvIiwiciIsIlJlc3VtYWJsZSIsImJhY2t1cFVwbG9hZCIsInRlc3RDaHVua3MiLCJjaHVua1NpemUiLCJtYXhGaWxlcyIsImZpbGVUeXBlIiwiYXNzaWduQnJvd3NlIiwiZG9jdW1lbnQiLCJnZXRFbGVtZW50QnlJZCIsImZpbGUiLCJjb25zb2xlIiwiZGVidWciLCJ0eXBlIiwiY2hlY2tTdGF0dXNGaWxlTWVyZ2luZyIsInJlbW92ZUNsYXNzIiwiZXZlbnQiLCJ1cGxvYWQiLCJtZXNzYWdlIiwiYmtwX1VwbG9hZEluUHJvZ3Jlc3MiLCJwZXJjZW50IiwidHJ5UGFyc2VKU09OIiwianNvbiIsIkpTT04iLCJwYXJzZSIsImRhdGEiLCJiYWNrdXBfaWQiLCJyZWFkeSJdLCJtYXBwaW5ncyI6Ijs7QUFBQTs7Ozs7Ozs7QUFRQTtBQUVBLElBQU1BLGtCQUFrQixHQUFHO0FBQzFCQyxFQUFBQSxPQUFPLEVBQUUsSUFEaUI7QUFFMUJDLEVBQUFBLGFBQWEsRUFBRSxFQUZXO0FBRzFCQyxFQUFBQSxXQUFXLEVBQUUsQ0FIYTtBQUkxQkMsRUFBQUEsaUJBQWlCLEVBQUVDLENBQUMsQ0FBQyxzQkFBRCxDQUFELENBQTBCQyxJQUExQixDQUErQixRQUEvQixDQUpPO0FBSzFCQyxFQUFBQSxNQUFNLEVBQUUsSUFMa0I7QUFNMUJDLEVBQUFBLEtBQUssRUFBRSxLQU5tQjtBQU8xQkMsRUFBQUEsVUFQMEI7QUFBQSx3QkFPZkYsTUFQZSxFQU9RO0FBQUEsVUFBZkMsS0FBZSx1RUFBUCxLQUFPO0FBQ2pDO0FBQ0FSLE1BQUFBLGtCQUFrQixDQUFDTyxNQUFuQixHQUE0QkEsTUFBNUI7QUFD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QUE0SW5COzs7OztBQUtBRSxFQUFBQSxzQkFqSm1CO0FBQUEsb0NBaUpJNUUsUUFqSkosRUFpSmNYLEtBakpkLEVBaUpxQjtBQUN2QyxVQUFJVyxRQUFRLEtBQUtNLFNBQWIsSUFBMEJWLE1BQU0sQ0FBQ3VGLFlBQVAsQ0FBb0JuRixRQUFwQixNQUFrQyxLQUFoRSxFQUF1RTtBQUN0RUksUUFBQUEsV0FBVyxDQUFDQyxTQUFaLFdBQXlCSCxlQUFlLENBQUNDLGVBQXpDO0FBQ0E7QUFDQTs7QUFDRCxVQUFNaUYsSUFBSSxHQUFHQyxJQUFJLENBQUNDLEtBQUwsQ0FBV3RGLFFBQVgsQ0FBYjs7QUFDQSxVQUFJb0YsSUFBSSxLQUFLOUUsU0FBVCxJQUFzQjhFLElBQUksQ0FBQ0csSUFBTCxLQUFjakYsU0FBeEMsRUFBbUQ7QUFDbERGLFFBQUFBLFdBQVcsQ0FBQ0MsU0FBWixXQUF5QkgsZUFBZSxDQUFDQyxlQUF6QztBQUNBO0FBQ0E7O0FBQ0QsVUFBTWYsTUFBTSxHQUFHZ0csSUFBSSxDQUFDRyxJQUFMLENBQVVDLFNBQXpCO0FBQ0EzRyxNQUFBQSxrQkFBa0IsQ0FBQ1MsVUFBbkIsQ0FBOEJGLE1BQTlCLEVBQXNDQyxLQUF0QztBQUNBOztBQTdKa0I7QUFBQTtBQUFBLENBQXBCO0FBa0tBSCxDQUFDLENBQUNvRixRQUFELENBQUQsQ0FBWW1CLEtBQVosQ0FBa0IsWUFBTTtBQUN2QnhFLEVBQUFBLFdBQVcsQ0FBQzNCLFVBQVo7QUFDQSxDQUZEIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgTUlLTyBMTEMgLSBBbGwgUmlnaHRzIFJlc2VydmVkXG4gKiBVbmF1dGhvcml6ZWQgY29weWluZyBvZiB0aGlzIGZpbGUsIHZpYSBhbnkgbWVkaXVtIGlzIHN0cmljdGx5IHByb2hpYml0ZWRcbiAqIFByb3ByaWV0YXJ5IGFuZCBjb25maWRlbnRpYWxcbiAqIFdyaXR0ZW4gYnkgTmlrb2xheSBCZWtldG92LCAxMiAyMDE5XG4gKlxuICovXG5cbi8qIGdsb2JhbCBQYnhBcGksIGdsb2JhbFRyYW5zbGF0ZSwgUmVzdW1hYmxlLCBnbG9iYWxSb290VXJsLCBVc2VyTWVzc2FnZSAqL1xuXG5jb25zdCBtZXJnaW5nQ2hlY2tXb3JrZXIgPSB7XG5cdHRpbWVPdXQ6IDMwMDAsXG5cdHRpbWVPdXRIYW5kbGU6ICcnLFxuXHRlcnJvckNvdW50czogMCxcblx0JHByb2dyZXNzQmFyTGFiZWw6ICQoJyN1cGxvYWQtcHJvZ3Jlc3MtYmFyJykuZmluZCgnLmxhYmVsJyksXG5cdGZpbGVJRDogbnVsbCxcblx0aXNYTUw6IGZhbHNlLFxuXHRpbml0aWFsaXplKGZpbGVJRCwgaXNYTUwgPSBmYWxzZSkge1xuXHRcdC8vINCX0LDQv9GD0YHRgtC40Lwg0L7QsdC90L7QstC70LXQvdC40LUg0YHRgtCw0YLRg9GB0LAg0L/RgNC+0LLQsNC50LTQtdGA0LBcblx0XHRtZXJnaW5nQ2hlY2tXb3JrZXIuZmlsZUlEID0gZmlsZUlEO1xuXHRcdG1lcmdpbmdDaGVja1dvcmtlci5pc1hNTCA9IGlzWE1MO1xuXHRcdG1lcmdpbmdDaGVja1dvcmtlci5yZXN0YXJ0V29ya2VyKGZpbGVJRCk7XG5cdH0sXG5cdHJlc3RhcnRXb3JrZXIoKSB7XG5cdFx0d2luZG93LmNsZWFyVGltZW91dChtZXJnaW5nQ2hlY2tXb3JrZXIudGltZW91dEhhbmRsZSk7XG5cdFx0bWVyZ2luZ0NoZWNrV29ya2VyLndvcmtlcigpO1xuXHR9LFxuXHR3b3JrZXIoKSB7XG5cdFx0UGJ4QXBpLkJhY2t1cFN0YXR1c1VwbG9hZChtZXJnaW5nQ2hlY2tXb3JrZXIuZmlsZUlELCBtZXJnaW5nQ2hlY2tXb3JrZXIuY2JBZnRlclJlc3BvbnNlKTtcblx0XHRtZXJnaW5nQ2hlY2tXb3JrZXIudGltZW91dEhhbmRsZSA9IHdpbmRvdy5zZXRUaW1lb3V0KFxuXHRcdFx0bWVyZ2luZ0NoZWNrV29ya2VyLndvcmtlcixcblx0XHRcdG1lcmdpbmdDaGVja1dvcmtlci50aW1lT3V0LFxuXHRcdCk7XG5cdH0sXG5cdGNiQWZ0ZXJSZXNwb25zZShyZXNwb25zZSkge1xuXHRcdGlmIChtZXJnaW5nQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHMgPiAxMCkge1xuXHRcdFx0bWVyZ2luZ0NoZWNrV29ya2VyLiRwcm9ncmVzc0JhckxhYmVsLnRleHQoZ2xvYmFsVHJhbnNsYXRlLmJrcF9VcGxvYWRFcnJvcik7XG5cdFx0XHRVc2VyTWVzc2FnZS5zaG93RXJyb3IoZ2xvYmFsVHJhbnNsYXRlLmJrcF9VcGxvYWRFcnJvcik7XG5cdFx0XHR3aW5kb3cuY2xlYXJUaW1lb3V0KG1lcmdpbmdDaGVja1dvcmtlci50aW1lb3V0SGFuZGxlKTtcblx0XHR9XG5cdFx0aWYgKHJlc3BvbnNlID09PSB1bmRlZmluZWQgfHwgT2JqZWN0LmtleXMocmVzcG9uc2UpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0bWVyZ2luZ0NoZWNrV29ya2VyLmVycm9yQ291bnRzICs9IDE7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChyZXNwb25zZS5zdGF0dXNfdXBsb2FkID09PSAnQ09NUExFVEUnKSB7XG5cdFx0XHRtZXJnaW5nQ2hlY2tXb3JrZXIuJHByb2dyZXNzQmFyTGFiZWwudGV4dChnbG9iYWxUcmFuc2xhdGUuYmtwX1VwbG9hZENvbXBsZXRlKTtcblx0XHRcdGlmIChtZXJnaW5nQ2hlY2tXb3JrZXIuaXNYTUwpIHtcblx0XHRcdFx0bWVyZ2luZ0NoZWNrV29ya2VyLiRwcm9ncmVzc0JhckxhYmVsLnRleHQoZ2xvYmFsVHJhbnNsYXRlLmJrcF9TZXR0aW5nc1Jlc3RvcmVkV2FpdFJlYm9vdCk7XG5cdFx0XHRcdFBieEFwaS5TeXN0ZW1SZWJvb3QoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHdpbmRvdy5sb2NhdGlvbi5yZWxvYWQoKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHJlc3BvbnNlLnN0YXR1c191cGxvYWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0bWVyZ2luZ0NoZWNrV29ya2VyLiRwcm9ncmVzc0JhckxhYmVsLnRleHQoZ2xvYmFsVHJhbnNsYXRlLmJrcF9VcGxvYWRQcm9jZXNzaW5nRmlsZXMpO1xuXHRcdFx0bWVyZ2luZ0NoZWNrV29ya2VyLmVycm9yQ291bnRzID0gMDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bWVyZ2luZ0NoZWNrV29ya2VyLmVycm9yQ291bnRzICs9IDE7XG5cdFx0fVxuXHR9LFxuXG59O1xuXG5cbmNvbnN0IGJhY2t1cEluZGV4ID0ge1xuXHQkdGVtcGxhdGVSb3c6ICQoJyNiYWNrdXAtdGVtcGxhdGUtcm93JyksXG5cdCRkdW1teTogJCgnI2R1bW15LXJvdycpLFxuXHQkdXBsb2FkQnV0dG9uOiAkKCcjdXBsb2FkYnRuJyksXG5cdCRwcm9ncmVzc0JhcjogJCgnI3VwbG9hZC1wcm9ncmVzcy1iYXInKSxcblx0JHByb2dyZXNzQmFyTGFiZWw6ICQoJyN1cGxvYWQtcHJvZ3Jlc3MtYmFyJykuZmluZCgnLmxhYmVsJyksXG5cdCRib2R5OiAkKCdib2R5JyksXG5cdHJlc3VtYWJsZTogbnVsbCxcblx0aW5pdGlhbGl6ZSgpIHtcblx0XHRiYWNrdXBJbmRleC4kcHJvZ3Jlc3NCYXIuaGlkZSgpO1xuXHRcdFBieEFwaS5CYWNrdXBHZXRGaWxlc0xpc3QoYmFja3VwSW5kZXguY2JCYWNrdXBHZXRGaWxlc0xpc3RBZnRlclJlc3BvbnNlKTtcblx0XHRiYWNrdXBJbmRleC4kYm9keS5vbignY2xpY2snLCAnYS5kb3dubG9hZCcsIChlKSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRjb25zdCBpZCA9ICQoZS50YXJnZXQpLmNsb3Nlc3QoJ2EnKS5hdHRyKCdkYXRhLXZhbHVlJyk7XG5cdFx0XHRQYnhBcGkuQmFja3VwRG93bmxvYWRGaWxlKGlkKTtcblx0XHR9KTtcblx0XHRiYWNrdXBJbmRleC4kYm9keS5vbignY2xpY2snLCAnYS5kZWxldGUnLCAoZSkgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0Y29uc3QgaWQgPSAkKGUudGFyZ2V0KS5jbG9zZXN0KCdhJykuYXR0cignZGF0YS12YWx1ZScpO1xuXHRcdFx0UGJ4QXBpLkJhY2t1cERlbGV0ZUZpbGUoaWQsIGJhY2t1cEluZGV4LmNiQWZ0ZXJEZWxldGVGaWxlKTtcblx0XHR9KTtcblx0XHRiYWNrdXBJbmRleC5pbml0aWFsaXplUmVzdW1hYmxlKCk7XG5cdH0sXG5cblx0LyoqXG5cdCAqINCa0L7Qu9C70LHQtdC6INC/0L7RgdC70LUg0YPQtNCw0LvQtdC90LjRjyDRhNCw0LnQu9CwINCx0LXQutCw0L/QsFxuXHQgKiBAcGFyYW0gcmVzcG9uc2Vcblx0ICovXG5cdGNiQWZ0ZXJEZWxldGVGaWxlKHJlc3BvbnNlKSB7XG5cdFx0aWYgKHJlc3BvbnNlKSB7XG5cdFx0XHR3aW5kb3cubG9jYXRpb24gPSBgJHtnbG9iYWxSb290VXJsfWJhY2t1cC9pbmRleGA7XG5cdFx0fVxuXHR9LFxuXHQvKipcblx0ICog0J7QsdGA0LDQsdC+0YLQutCwINC+0YLQstC10YLQsCBCYWNrdXBHZXRGaWxlc0xpc3Rcblx0ICogQHBhcmFtIHJlc3BvbnNlXG5cdCAqL1xuXHRjYkJhY2t1cEdldEZpbGVzTGlzdEFmdGVyUmVzcG9uc2UocmVzcG9uc2UpIHtcblx0XHRiYWNrdXBJbmRleC4kZHVtbXkuc2hvdygpO1xuXHRcdGlmIChyZXNwb25zZS5sZW5ndGggPT09IDAgfHwgcmVzcG9uc2UgPT09IGZhbHNlKSB7XG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0UGJ4QXBpLkJhY2t1cEdldEZpbGVzTGlzdChiYWNrdXBJbmRleC5jYkJhY2t1cEdldEZpbGVzTGlzdEFmdGVyUmVzcG9uc2UpO1xuXHRcdFx0fSwgMzAwMCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGJhY2t1cEluZGV4LiRkdW1teS5oaWRlKCk7XG5cdFx0JC5lYWNoKHJlc3BvbnNlLCAoa2V5LCB2YWx1ZSkgPT4ge1xuXHRcdFx0bGV0ICRuZXdSb3cgPSAkKGB0ciMke3ZhbHVlLmlkfWApO1xuXHRcdFx0aWYgKCRuZXdSb3cubGVuZ3RoID4gMCkge1xuXHRcdFx0XHQkbmV3Um93LnJlbW92ZSgpO1xuXHRcdFx0fVxuXHRcdFx0JG5ld1JvdyA9IGJhY2t1cEluZGV4LiR0ZW1wbGF0ZVJvdy5jbG9uZSgpO1xuXHRcdFx0JG5ld1Jvdy5hdHRyKCdpZCcsIHZhbHVlLmlkKTtcblx0XHRcdCRuZXdSb3cuYWRkQ2xhc3MoJ2JhY2t1cEluZGV4LWZpbGUnKTtcblx0XHRcdGNvbnN0IGFyaERhdGUgPSBuZXcgRGF0ZSgxMDAwICogdmFsdWUuZGF0ZSk7XG5cdFx0XHQkbmV3Um93LmZpbmQoJy5jcmVhdGUtZGF0ZScpLmh0bWwoYXJoRGF0ZS50b0xvY2FsZVN0cmluZygpKTtcblx0XHRcdCRuZXdSb3cuZmluZCgnLmZpbGUtc2l6ZScpLmh0bWwoYCR7dmFsdWUuc2l6ZX0gTUJgKTtcblx0XHRcdGlmICh2YWx1ZS5waWQubGVuZ3RoICsgdmFsdWUucGlkX3JlY292ZXIubGVuZ3RoID4gMCkge1xuXHRcdFx0XHQkbmV3Um93LmZpbmQoJ2EnKS5lYWNoKChpbmRleCwgb2JqKSA9PiB7XG5cdFx0XHRcdFx0JChvYmopLnJlbW92ZSgpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgcGVyY2VudE9mVG90YWwgPSAxMDAgKiAodmFsdWUucHJvZ3Jlc3MgLyB2YWx1ZS50b3RhbCk7XG5cdFx0XHRcdCRuZXdSb3cuZmluZCgnLnN0YXR1cycpLmh0bWwoYDxpIGNsYXNzPVwic3Bpbm5lciBsb2FkaW5nIGljb25cIj48L2k+ICR7cGFyc2VJbnQocGVyY2VudE9mVG90YWwsIDEwKX0gJWApO1xuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRQYnhBcGkuQmFja3VwR2V0RmlsZXNMaXN0KGJhY2t1cEluZGV4LmNiQmFja3VwR2V0RmlsZXNMaXN0QWZ0ZXJSZXNwb25zZSk7XG5cdFx0XHRcdH0sIDMwMDApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0JG5ld1Jvdy5maW5kKCdhJykuZWFjaCgoaW5kZXgsIG9iaikgPT4ge1xuXHRcdFx0XHRcdCQob2JqKS5hdHRyKCdocmVmJywgJChvYmopLmF0dHIoJ2hyZWYnKSArIHZhbHVlLmlkKTtcblx0XHRcdFx0XHQkKG9iaikuYXR0cignZGF0YS12YWx1ZScsIHZhbHVlLmlkKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdCRuZXdSb3cuZmluZCgnLnN0YXR1cycpLmh0bWwoJzxpIGNsYXNzPVwiYXJjaGl2ZSBpY29uXCI+PC9pPicpO1xuXHRcdFx0fVxuXHRcdFx0JG5ld1Jvdy5hcHBlbmRUbygnI2V4aXN0aW5nLWJhY2t1cC1maWxlcy10YWJsZScpO1xuXHRcdH0pO1xuXHR9LFxuXHQvKipcblx0ICog0J/QvtC00LrQu9GO0YfQtdC90LjQtSDQvtCx0YDQsNCx0L7RgtGH0LrQuNC60LAg0LfQsNCz0YDRg9C30LrQuCDRhNCw0LnQu9C+0LIg0L/QviDRh9Cw0YHRgtGP0Lxcblx0ICovXG5cdGluaXRpYWxpemVSZXN1bWFibGUoKSB7XG5cdFx0Y29uc3QgciA9IG5ldyBSZXN1bWFibGUoe1xuXHRcdFx0dGFyZ2V0OiBQYnhBcGkuYmFja3VwVXBsb2FkLFxuXHRcdFx0dGVzdENodW5rczogZmFsc2UsXG5cdFx0XHRjaHVua1NpemU6IDMwICogMTAyNCAqIDEwMjQsXG5cdFx0XHRtYXhGaWxlczogMSxcblx0XHRcdGZpbGVUeXBlOiBbJ2ltZycsICd6aXAnLCAneG1sJ10sXG5cdFx0fSk7XG5cblx0XHRyLmFzc2lnbkJyb3dzZShkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndXBsb2FkYnRuJykpO1xuXHRcdHIub24oJ2ZpbGVTdWNjZXNzJywgKGZpbGUsIHJlc3BvbnNlKSA9PiB7XG5cdFx0XHRjb25zb2xlLmRlYnVnKCdmaWxlU3VjY2VzcycsIGZpbGUpO1xuXHRcdFx0bGV0IGlzWE1MID0gZmFsc2U7XG5cdFx0XHRpZiAoZmlsZS5maWxlICE9PSB1bmRlZmluZWQgJiYgZmlsZS5maWxlLnR5cGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRpc1hNTCA9IGZpbGUuZmlsZS50eXBlID09PSAndGV4dC94bWwnO1xuXHRcdFx0fVxuXHRcdFx0YmFja3VwSW5kZXguY2hlY2tTdGF0dXNGaWxlTWVyZ2luZyhyZXNwb25zZSwgaXNYTUwpO1xuXHRcdFx0YmFja3VwSW5kZXguJHVwbG9hZEJ1dHRvbi5yZW1vdmVDbGFzcygnbG9hZGluZycpO1xuXHRcdH0pO1xuXHRcdHIub24oJ2ZpbGVQcm9ncmVzcycsIChmaWxlKSA9PiB7XG5cdFx0XHRjb25zb2xlLmRlYnVnKCdmaWxlUHJvZ3Jlc3MnLCBmaWxlKTtcblx0XHR9KTtcblx0XHRyLm9uKCdmaWxlQWRkZWQnLCAoZmlsZSwgZXZlbnQpID0+IHtcblx0XHRcdHIudXBsb2FkKCk7XG5cdFx0XHRjb25zb2xlLmRlYnVnKCdmaWxlQWRkZWQnLCBldmVudCk7XG5cdFx0fSk7XG5cdFx0ci5vbignZmlsZVJldHJ5JywgKGZpbGUpID0+IHtcblx0XHRcdGNvbnNvbGUuZGVidWcoJ2ZpbGVSZXRyeScsIGZpbGUpO1xuXHRcdH0pO1xuXHRcdHIub24oJ2ZpbGVFcnJvcicsIChmaWxlLCBtZXNzYWdlKSA9PiB7XG5cdFx0XHRjb25zb2xlLmRlYnVnKCdmaWxlRXJyb3InLCBmaWxlLCBtZXNzYWdlKTtcblx0XHR9KTtcblxuXHRcdHIub24oJ3VwbG9hZFN0YXJ0JywgKCkgPT4ge1xuXHRcdFx0Y29uc29sZS5kZWJ1ZygndXBsb2FkU3RhcnQnKTtcblx0XHRcdGJhY2t1cEluZGV4LiR1cGxvYWRCdXR0b24uYWRkQ2xhc3MoJ2xvYWRpbmcnKTtcblx0XHRcdGJhY2t1cEluZGV4LiRwcm9ncmVzc0Jhci5zaG93KCk7XG5cdFx0XHRiYWNrdXBJbmRleC4kcHJvZ3Jlc3NCYXJMYWJlbC50ZXh0KGdsb2JhbFRyYW5zbGF0ZS5ia3BfVXBsb2FkSW5Qcm9ncmVzcyk7XG5cdFx0fSk7XG5cdFx0ci5vbignY29tcGxldGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zb2xlLmRlYnVnKCdjb21wbGV0ZScpO1xuXHRcdH0pO1xuXHRcdHIub24oJ3Byb2dyZXNzJywgKCkgPT4ge1xuXHRcdFx0Y29uc29sZS5kZWJ1ZygncHJvZ3Jlc3MnKTtcblx0XHRcdGJhY2t1cEluZGV4LiRwcm9ncmVzc0Jhci5wcm9ncmVzcyh7XG5cdFx0XHRcdHBlcmNlbnQ6IDEwMCAqIHIucHJvZ3Jlc3MoKSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdHIub24oJ2Vycm9yJywgKG1lc3NhZ2UsIGZpbGUpID0+IHtcblx0XHRcdGNvbnNvbGUuZGVidWcoJ2Vycm9yJywgbWVzc2FnZSwgZmlsZSk7XG5cdFx0XHRiYWNrdXBJbmRleC4kcHJvZ3Jlc3NCYXJMYWJlbC50ZXh0KGdsb2JhbFRyYW5zbGF0ZS5ia3BfVXBsb2FkRXJyb3IpO1xuXHRcdFx0YmFja3VwSW5kZXguJHVwbG9hZEJ1dHRvbi5yZW1vdmVDbGFzcygnbG9hZGluZycpO1xuXHRcdFx0VXNlck1lc3NhZ2Uuc2hvd0Vycm9yKGAke2dsb2JhbFRyYW5zbGF0ZS5ia3BfVXBsb2FkRXJyb3J9PGJyPiR7bWVzc2FnZX1gKTtcblx0XHR9KTtcblx0XHRyLm9uKCdwYXVzZScsICgpID0+IHtcblx0XHRcdGNvbnNvbGUuZGVidWcoJ3BhdXNlJyk7XG5cdFx0fSk7XG5cdFx0ci5vbignY2FuY2VsJywgKCkgPT4ge1xuXHRcdFx0Y29uc29sZS5kZWJ1ZygnY2FuY2VsJyk7XG5cdFx0fSk7XG5cdH0sXG5cdC8qKlxuXHQgKiDQl9Cw0L/Rg9GB0Log0L/RgNC+0YbQtdGB0YHQsCDQvtC20LjQtNCw0L3QuNGPINGB0LrQu9C10LjQstCw0L3QuNGPINGE0LDQudC70LAg0L/QvtGB0LvQtSDQt9Cw0LPRgNGD0LfQutC4INC90LAg0YHQtdGA0LLQtdGAXG5cdCAqXG5cdCAqIEBwYXJhbSByZXNwb25zZSDQvtGC0LLQtdGCINGE0YPQvdC60YbQuNC4IC9wYnhjb3JlL2FwaS9iYWNrdXAvdXBsb2FkXG5cdCAqL1xuXHRjaGVja1N0YXR1c0ZpbGVNZXJnaW5nKHJlc3BvbnNlLCBpc1hNTCkge1xuXHRcdGlmIChyZXNwb25zZSA9PT0gdW5kZWZpbmVkIHx8IFBieEFwaS50cnlQYXJzZUpTT04ocmVzcG9uc2UpID09PSBmYWxzZSkge1xuXHRcdFx0VXNlck1lc3NhZ2Uuc2hvd0Vycm9yKGAke2dsb2JhbFRyYW5zbGF0ZS5ia3BfVXBsb2FkRXJyb3J9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGpzb24gPSBKU09OLnBhcnNlKHJlc3BvbnNlKTtcblx0XHRpZiAoanNvbiA9PT0gdW5kZWZpbmVkIHx8IGpzb24uZGF0YSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRVc2VyTWVzc2FnZS5zaG93RXJyb3IoYCR7Z2xvYmFsVHJhbnNsYXRlLmJrcF9VcGxvYWRFcnJvcn1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZmlsZUlEID0ganNvbi5kYXRhLmJhY2t1cF9pZDtcblx0XHRtZXJnaW5nQ2hlY2tXb3JrZXIuaW5pdGlhbGl6ZShmaWxlSUQsIGlzWE1MKTtcblx0fSxcblxufTtcblxuXG4kKGRvY3VtZW50KS5yZWFkeSgoKSA9PiB7XG5cdGJhY2t1cEluZGV4LmluaXRpYWxpemUoKTtcbn0pO1xuIl19