// Nutze die RN-eigene FormData-Implementierung
module.exports = global.FormData || require('react-native/Libraries/Network/FormData').default;
module.exports.default = module.exports;