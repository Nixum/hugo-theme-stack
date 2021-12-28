interface pageData {
    title: string,
    date: string,
    permalink: string,
    content: string,
    image?: string,
    preview: string,
    matchCount: number
}

interface match {
    start: number,
    end: number
}

/**
 * Escape HTML tags as HTML entities
 * Edited from:
 * @link https://stackoverflow.com/a/5499821
 */
const tagsToReplace = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '…': '&hellip;'
};

function replaceTag(tag) {
    return tagsToReplace[tag] || tag;
}

function replaceHTMLEnt(str) {
    return str.replace(/[&<>"]/g, replaceTag);
}

function escapeRegExp(string) {
    return string.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
}

class Search {
    private data: pageData[];
    private form: HTMLFormElement;
    private input: HTMLInputElement;
    private list: HTMLDivElement;
    private resultTitle: HTMLHeadElement;
    private resultTitleTemplate: string;

    constructor({ form, input, list, resultTitle, resultTitleTemplate }) {
        this.form = form;
        this.input = input;
        this.list = list;
        this.resultTitle = resultTitle;
        this.resultTitleTemplate = resultTitleTemplate;

        this.handleQueryString();
        this.bindQueryStringChange();
        this.bindSearchForm();
    }

    private static processMatches(str: string, matches: match[]): string[] {
        matches.sort((a, b) => {
            return a.start - b.start;
        });

        let i = 0,
            lastIndex = 0;

        let resultArray: string[] = [];

        while (i < matches.length) {
            const item = matches[i];

            if (item.start > lastIndex) {
                resultArray.push(str.substring(lastIndex, item.start));
            }

            let j = i + 1,
                end = item.end;

            while (j < matches.length && matches[j].start <= end) {
                end = matches[j].end;
                j++;
            }

            resultArray.push(`<mark>${str.substring(item.start, end)}</mark>`);

            i = j;
            lastIndex = end;
        }

        resultArray.push(str.substring(lastIndex));

        return resultArray;
    }

    private async searchKeywords(keywords: string[]) {
        const rawData = await this.getData();
        let results: pageData[] = [];

        for (const item of rawData) {
            let titleMatches: match[] = [],
                contentMatches: match[] = [];

            let result = {
                ...item,
                preview: '',
                matchCount: 0
            }

            for (const keyword of keywords) {
                if (keyword === '') continue;

                const regex = new RegExp(escapeRegExp(replaceHTMLEnt(keyword)), 'gi');

                const contentMatch = regex.exec(result.content);
                regex.lastIndex = 0;            /// Reset regex

                const titleMatch = regex.exec(result.title);
                regex.lastIndex = 0;            /// Reset regex

                if (titleMatch) {
                    titleMatches.push({
                        start: titleMatch.index,
                        end: titleMatch.index + titleMatch[0].length
                    });
                }

                if (contentMatch) {
                    contentMatches.push({
                        start: contentMatch.index,
                        end: contentMatch.index + contentMatch[0].length
                    });
                }
            }

            if (titleMatches.length > 0) {
                result.title = Search.processMatches(result.title, titleMatches).join('');
            }

            if (contentMatches.length > 0) {
                result.preview = Search.processMatches(result.content, contentMatches).join('');
            }

            if (titleMatches.length > 0 || contentMatches.length > 0) {
                results.push(result);
            }
        }

        /** Result with more matches appears first */
        return results.sort((a, b) => {
            return b.matchCount - a.matchCount;
        });
    }

    public static marker(match) {
        return '<mark>' + match + '</mark>';
    }

    private async doSearch(keywords: string[]) {
        const startTime = performance.now();

        const results = await this.searchKeywords(keywords);
        this.clear();

        for (const item of results) {
            this.list.append(Search.render(item));
        }

        const endTime = performance.now();

        this.resultTitle.innerText = this.generateResultTitle(results.length, ((endTime - startTime) / 1000).toPrecision(1));
    }

    private generateResultTitle(resultLen, time) {
        return this.resultTitleTemplate.replace("#PAGES_COUNT", resultLen).replace("#TIME_SECONDS", time);
    }

    public async getData() {
        if (!this.data) {
            /// Not fetched yet
            const jsonURL = this.form.dataset.json;
            this.data = await fetch(jsonURL).then(res => res.json());
        }

        return this.data;
    }

    private bindSearchForm() {
        let lastSearch = '';

        const eventHandler = (e) => {
            e.preventDefault();
            const keywords = this.input.value;

            Search.updateQueryString(keywords, true);

            if (keywords === '') {
                return this.clear();
            }

            if (lastSearch === keywords) return;
            lastSearch = keywords;

            this.doSearch(keywords.split(' '));
        }

        this.input.addEventListener('input', eventHandler);
        this.input.addEventListener('compositionend', eventHandler);
    }

    private clear() {
        this.list.innerHTML = '';
        this.resultTitle.innerText = '';
    }

    private bindQueryStringChange() {
        window.addEventListener('popstate', (e) => {
            this.handleQueryString()
        })
    }

    private handleQueryString() {
        const pageURL = new URL(window.location.toString());
        const keywords = pageURL.searchParams.get('keyword');
        this.input.value = keywords;

        if (keywords) {
            this.doSearch(keywords.split(' '));
        }
        else {
            this.clear()
        }
    }

    private static updateQueryString(keywords: string, replaceState = false) {
        const pageURL = new URL(window.location.toString());

        if (keywords === '') {
            pageURL.searchParams.delete('keyword')
        }
        else {
            pageURL.searchParams.set('keyword', keywords);
        }

        if (replaceState) {
            window.history.replaceState('', '', pageURL.toString());
        }
        else {
            window.history.pushState('', '', pageURL.toString());
        }
    }

    public static render(item: pageData) {
        return <article>
            <a href={item.permalink}>
                <div class="article-details">
                    <h2 class="article-title" dangerouslySetInnerHTML={{ __html: item.title }}></h2>
                    <section class="article-preview" dangerouslySetInnerHTML={{ __html: item.preview }}></section>
                </div>
                {item.image &&
                    <div class="article-image">
                        <img src={item.image} loading="lazy" />
                    </div>
                }
            </a>
        </article>;
    }
}

declare global {
    interface Window {
        searchResultTitleTemplate: string;
    }
}

window.addEventListener('load', () => {
    setTimeout(function () {
        const searchForm = document.querySelector('.search-form') as HTMLFormElement,
            searchInput = searchForm.querySelector('input') as HTMLInputElement,
            searchResultList = document.querySelector('.search-result--list') as HTMLDivElement,
            searchResultTitle = document.querySelector('.search-result--title') as HTMLHeadingElement;

        new Search({
            form: searchForm,
            input: searchInput,
            list: searchResultList,
            resultTitle: searchResultTitle,
            resultTitleTemplate: window.searchResultTitleTemplate
        });
    }, 0);
})

export default Search;