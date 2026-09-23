(() => {
  if (window.__xhsCollectorInstalled) {
    console.log("评论收集器已经安装");
    return;
  }

  const API_PATTERN =
    /\/api\/sns\/web\/v2\/comment\/(?:sub\/)?page/;

  window.__xhsCollectorInstalled = true;
  window.__xhsComments = new Map();
  window.__xhsCapturedPages = [];

  function formatTime(value) {
    const number = Number(value);
    if (!number) return "";

    const milliseconds = number < 1e12 ? number * 1000 : number;
    return new Date(milliseconds).toISOString();
  }

  function collectResponse(url, response) {
    if (!API_PATTERN.test(url)) return;

    const data = response?.data;
    const comments = Array.isArray(data?.comments)
      ? data.comments
      : [];

    let rootCommentId = "";

    try {
      const parsedUrl = new URL(url, location.origin);
      rootCommentId =
        parsedUrl.searchParams.get("root_comment_id") || "";
    } catch (error) {}

    function walk(list, fallbackParentId = "") {
      for (const comment of list || []) {
        if (!comment?.id) continue;

        const user = comment.user_info || {};
        const target = comment.target_comment || {};

        const parentCommentId =
          target.id ||
          target.comment_id ||
          fallbackParentId ||
          "";

        window.__xhsComments.set(comment.id, {
          comment_id: comment.id,
          parent_comment_id: parentCommentId,
          root_comment_id: rootCommentId,
          note_id: comment.note_id || "",
          nickname: user.nickname || "",
          content: comment.content || "",
          create_time: comment.create_time || "",
          create_time_text: formatTime(comment.create_time),
          ip_location: comment.ip_location || "",
          like_count: Number(comment.like_count || 0),
          status: comment.status ?? "",
          reply_count: Array.isArray(comment.sub_comments)
            ? comment.sub_comments.length
            : 0
        });

        if (Array.isArray(comment.sub_comments)) {
          walk(comment.sub_comments, comment.id);
        }
      }
    }

    walk(comments, rootCommentId);

    window.__xhsCapturedPages.push({
      url_type: url.includes("/sub/page")
        ? "楼中楼回复"
        : "一级评论",
      captured_at: new Date().toISOString(),
      comment_count: comments.length,
      cursor: data?.cursor || "",
      has_more: data?.has_more ?? ""
    });

    console.log(
      `已捕获：${comments.length}条，本地累计去重后：${window.__xhsComments.size}条`
    );
  }

  // 捕获 fetch 请求
  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    try {
      const request = args[0];
      const url =
        typeof request === "string"
          ? request
          : request?.url || "";

      if (API_PATTERN.test(url)) {
        response
          .clone()
          .json()
          .then(data => collectResponse(url, data))
          .catch(() => {});
      }
    } catch (error) {}

    return response;
  };

  // 捕获 XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (
    method,
    url,
    ...rest
  ) {
    this.__xhsCollectorUrl = String(url || "");
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener(
      "load",
      function () {
        const url = this.__xhsCollectorUrl || "";
        if (!API_PATTERN.test(url)) return;

        try {
          const data =
            this.responseType === "json"
              ? this.response
              : JSON.parse(this.responseText);

          collectResponse(url, data);
        } catch (error) {}
      },
      { once: true }
    );

    return originalSend.apply(this, args);
  };

  window.xhsCommentsStatus = function () {
    const rows = [...window.__xhsComments.values()];

    console.table(
      rows.map(item => ({
        昵称: item.nickname,
        评论: item.content,
        IP属地: item.ip_location,
        点赞: item.like_count
      }))
    );

    console.log(`当前已收集并去重：${rows.length}条`);
    console.log(
      `捕获的分页请求：${window.__xhsCapturedPages.length}次`
    );

    return rows;
  };

  window.exportXhsComments = function () {
    const comments = [...window.__xhsComments.values()];

    const result = {
      exported_at: new Date().toISOString(),
      total: comments.length,
      comments
    };

    const blob = new Blob(
      [JSON.stringify(result, null, 2)],
      { type: "application/json;charset=utf-8" }
    );

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `小红书评论_${comments.length}条_${Date.now()}.json`;
    link.click();

    setTimeout(() => URL.revokeObjectURL(link.href), 1000);

    console.log(`已导出${comments.length}条评论`);
  };

  window.resetXhsComments = function () {
    window.__xhsComments.clear();
    window.__xhsCapturedPages.length = 0;
    console.log("已清空当前收集结果");
  };

  console.log("评论收集器安装成功");
  console.log("请关闭并重新打开帖子，然后滚动评论、展开回复");
  console.log("查看结果：xhsCommentsStatus()");
  console.log("导出JSON：exportXhsComments()");
})();