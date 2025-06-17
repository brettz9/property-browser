/*globals $*/

/*
TODOS:
1) Cause changes in article of language to force reload so as to be bookmarkable (then deal with empty)
2) Support bi-directional languages
3) i18n
*/

(function () {
'use strict';

var baseURL = 'https://www.wikidata.org';

function getConfigObject (contentModel, id) {
    var prefix;
    switch (contentModel) {
        case 'item':
            prefix = 'Q';
            break;
        case 'property':
            prefix = 'Property:P';
            break;
        case 'languages':
            return {format:'json', action:'query', 
                            meta:'siteinfo', siprop:'languages'
            };
        case 'search':
            return {format:'json', action:'query', 
                            list: 'search', srsearch: id, srlimit: 10};
    }
    return {format:'json', action:'query', 
                    prop:'revisions', rvlimit:1, meta:'siteinfo', rvprop:'content', titles: prefix + id};
}


function getEntityChildren (contentModel, id, cb) {
    var deferred = $.Deferred();
    id = (String(id)).replace(/^(Q|Property:P)/i, '');
    $.getJSON(baseURL + '/w/api.php?callback=?', getConfigObject(contentModel, id), function (data) {
        var pages = data.query.pages,
            latestRevision = Object.keys(pages)[0],
            json = JSON.parse(pages[latestRevision].revisions[0]['*']),
            claims = json.claims, // Always an empty array if a property?
            label = json.label[$('#languages').val()];

        if (cb) {
            cb(label, claims);
        }
        else {
            deferred.resolve([label, claims, id]);
        }
    });
    return deferred;
}

function processClaims (claims, ul) {
    var deferreds = $.map(claims, function (claim) {
        if (!claim.m || typeof claim.m !== 'object' || claim.m[0] !== 'value') { // Other possibilities to handle?
            return;
        }
        var dfr,
            propID = claim.m[1],
            valueType = claim.m[2],
            innerValue = claim.m[3];
        
        switch (valueType) {
            case 'string':
                // The following are mentioned in the API or extension source code, but not clear on whether active,
                //   so commenting out until chance to confirm
                // case 'geocoordinate':  case 'bool': case 'float': case 'int': case 'null': case 'title':
                // case 'quantity': case 'monolingualtext': case 'multilingualtext': case 'time':
                dfr = getEntityChildren('property', propID, function (prop) {
                    dfr.resolve([prop, innerValue, null, propID, null, propID === 373 ? 'https://commons.wikimedia.org/wiki/Category:' : null]);
                });
                return dfr;
            case 'wikibase-entityid':
                dfr = getEntityChildren('property', propID, function (prop) {
                    var numericID = innerValue['numeric-id'];
                    getEntityChildren('item', numericID, function (innerValue, claims) {
                        dfr.resolve([prop, innerValue, claims, propID, numericID]);
                    });
                });
                return dfr;
            default:
                throw 'Unexpected value type: ' + valueType;
        }
    });
    $.when.apply($.when, deferreds).done(function () {
        $.makeArray(arguments).sort(function (a, b) {
            return (a[0] === b[0]) ? // If properties are equal, we sort by values
                (a[1] > b[1] ? 1 : -1) :
                (a[0] > b[0] ? 1 : -1);
        }).forEach(function (data) {
            var prop = data[0], val = data[1], claims = data[2], propID = data[3], numericID = data[4], commons = data[5],
                li = $('<li>').appendTo(ul).html('<i><a href="'+baseURL+'/wiki/Property:P'+propID+'">' + prop + '</a></i>' + ': ' + (numericID ? val + ' <small>(<a href="'+baseURL+'/wiki/Q' + numericID + '">' + numericID + '</a>)</small>' : (commons ? '<a href="' + commons + val + '">' + val + '</a>' : val))),
                newUl = $('<ul>').appendTo(li);
            li.click(function (e) {
                e.stopPropagation();
                if (!newUl.children().length && claims) {
                    processClaims(claims, newUl);
                }
            });
        });
    });
}

function initialReturn (data) {
    var label = data[0],
        claims = data[1],
        id = data[2],
        li = $('<li>').appendTo($('#entities')).html(label + ' <small>(<a href="'+baseURL+'/wiki/Q'+id+'">'+id+'</a>)</small>'),
        ul = $('<ul>').appendTo(li);
    li.click(function (e) {
        e.stopPropagation();
        if (!ul.children().length) {
            processClaims(claims, ul);
        }
    });
}

function doSearch (name) {
    $.getJSON(baseURL + '/w/api.php?callback=?', getConfigObject('search', name), function (data) {
        var results = data.query.search,
            deferreds = $.map(results, function (result) {
                return getEntityChildren('item', result.title);
            });
        $.when.apply($.when, deferreds).done(function () {
            $.makeArray(arguments).sort(function (a, b) {
                return a[0] === undefined ? 1 : // Undefined apparently trips up Firefox into thinking the array is finished
                    (a[0] === b[0]) ? // If properties are equal, we sort by values
                    (a[1] > b[1] ? 1 : -1) :
                    (a[0] > b[0] ? 1 : -1);
            }).forEach(initialReturn);
        });
    });
}


$(function () {

    // INITIATE AND ATTACH EVENTS
    ini_set('phpjs.parse_url.mode', 'strict');
    var purl = parse_url(window.location.href),
        qk = purl.queryKey,
        langValue = qk.language || 'en';

    if (qk.article) {
        $('#startArticle').val(decodeURIComponent(qk.article));
    }

    doSearch($('#startArticle').val());
    $('#startArticle').change(function (e) {
        // TODO: Implement http_build_url.js for php.js to rebuild URL and redirect for boomarkability
        // delete purl.query;
        // delete purl.queryKey;

        doSearch(e.target.value);
    });
    
    /*
    getEntityChildren('item', $('#start').val()).done(initialReturn);
    $('#start').change(function (e) {
        getEntityChildren('item', e.target.value).done(initialReturn);
    });
    */
    
    $('#empty').click(function empty () {
        $('#entities').empty();
    });
    
    // LANGUAGES
    $.getJSON(baseURL + '/w/api.php?callback=?', getConfigObject('languages'), function (data) {
        var options = $.map(data.query.languages, function (data) {
            return '<option value="'+ data.code +'">' + data['*'] + '</option>';
        }).join('').replace('"' + langValue + '"', '"' + langValue + '" selected');
        $('#languages').append(options);
    });    
});

}());
