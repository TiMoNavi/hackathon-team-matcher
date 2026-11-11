(function () {
    var image = document.getElementById('crop-profile-image');
    var selection = document.getElementById('matcher-avatar-crop-selection');
    if (!image || !selection) { return; }
    var fields = {};
    ['cropX', 'cropY', 'cropW', 'cropH'].forEach(function (key) { fields[key] = document.getElementById(key); });
    var start = null;
    function paint() {
        if (!image.naturalWidth || !image.naturalHeight) { return; }
        selection.style.left = (Number(fields.cropX.value) / image.naturalWidth * 100) + '%';
        selection.style.top = (Number(fields.cropY.value) / image.naturalHeight * 100) + '%';
        selection.style.width = (Number(fields.cropW.value) / image.naturalWidth * 100) + '%';
        selection.style.height = (Number(fields.cropH.value) / image.naturalHeight * 100) + '%';
    }
    function initialize() {
        var size = Math.min(image.naturalWidth, image.naturalHeight);
        fields.cropX.value = String(Math.floor((image.naturalWidth - size) / 2));
        fields.cropY.value = String(Math.floor((image.naturalHeight - size) / 2));
        fields.cropW.value = fields.cropH.value = String(size);
        fields.cropX.max = fields.cropW.max = String(image.naturalWidth);
        fields.cropY.max = fields.cropH.max = String(image.naturalHeight);
        paint();
    }
    function position(event) {
        var bounds = image.getBoundingClientRect();
        return {
            x: Math.max(0, Math.min(image.naturalWidth - 1, Math.floor((event.clientX - bounds.left) / bounds.width * image.naturalWidth))),
            y: Math.max(0, Math.min(image.naturalHeight - 1, Math.floor((event.clientY - bounds.top) / bounds.height * image.naturalHeight)))
        };
    }
    image.addEventListener('pointerdown', function (event) {
        if (!image.naturalWidth || event.button !== 0) { return; }
        event.preventDefault(); start = position(event); image.setPointerCapture(event.pointerId);
    });
    image.addEventListener('pointermove', function (event) {
        if (!start) { return; }
        var end = position(event);
        fields.cropX.value = String(Math.min(start.x, end.x));
        fields.cropY.value = String(Math.min(start.y, end.y));
        fields.cropW.value = String(Math.max(1, Math.abs(end.x - start.x)));
        fields.cropH.value = String(Math.max(1, Math.abs(end.y - start.y)));
        paint();
    });
    image.addEventListener('pointerup', function () { start = null; });
    image.addEventListener('pointercancel', function () { start = null; });
    Object.values(fields).forEach(function (field) { field.addEventListener('input', paint); });
    if (image.complete && image.naturalWidth) { initialize(); } else { image.addEventListener('load', initialize, {once: true}); }
})();
