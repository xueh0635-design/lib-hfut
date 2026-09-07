# Course Browser

这个 Fork 在原 `lib-hfut/lib-hfut` 资料仓库基础上增加了一个更适合手机使用的课程资料浏览器。

## 功能

- 首页直接列出课程与其他资料分类
- 支持中文课程名、课程代码和文件名搜索
- 支持逐层浏览文件夹
- 文件提供“查看”和“下载”按钮
- 使用预生成 JSON 索引，不依赖 MkDocs/Lunr 的中文分词
- 每次 `master` 更新后自动重新生成索引并发布到 `gh-pages`

## 构建

```bash
python build_browser.py
```

生成内容位于 `public/`，该目录不会提交到 `master`，而是在 GitHub Actions 中生成并发布。

## 来源与许可

课程资料源自 [lib-hfut/lib-hfut](https://github.com/lib-hfut/lib-hfut)，原项目使用 CC BY 4.0。
本 Fork 仅对浏览、索引和下载界面做改进。
