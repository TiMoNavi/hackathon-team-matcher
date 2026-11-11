(function ($) {
    // Native upload/delete are explicit identity writes. Keep this page's controls on their returned version.
    $(document).off('ajaxSuccess.matcherProfileAvatar').on('ajaxSuccess.matcherProfileAvatar', function (event, xhr, settings) {
        if (!settings || String(settings.url).indexOf('/user/image/') === -1) { return; }
        var result = xhr.responseJSON;
        var record = result && result.files ? result.files[0] : result;
        if (!record || record.error || !Number.isSafeInteger(record.identity_version)) { return; }
        var version = record.identity_version;
        $('[data-url],[data-upload-url],[data-action-url],[data-action-click-url],[data-load-url],[href]').each(function () {
            var node = this;
            Array.from(node.attributes).forEach(function (attribute) {
                var value = attribute.value;
                if (value.indexOf('/user/image/') === -1 || value.indexOf('expected_version=') === -1) { return; }
                var updated = value.replace(/([?&]expected_version=)[0-9]+/g, '$1' + version);
                node.setAttribute(attribute.name, updated);
                if (attribute.name.indexOf('data-') === 0) { $(node).data(attribute.name.slice(5), updated); }
                if (node.tagName === 'INPUT' && node.type === 'file') {
                    var widget = humhub.require('ui.widget').Widget.instance($(node));
                    if (widget && widget.options) { widget.options.url = updated; }
                    if ($(node).data('blueimp-fileupload')) { $(node).fileupload('option', 'url', updated); }
                }
            });
        });
        $('input[name="matcher_identity_version"]').val(version);
    });
})(jQuery);
