(async () => {
  const ACTION_ID = "REPLACE_WITH_ACTION_ID";
  const CATEGORY_ID = "REPLACE_WITH_CATEGORY_ID"; // 例如成人组
  const PAGE_SIZE = 30;
  const LIST_LIMIT = 8;
  const WAIT_MS = 200;

  const LIST_URL =
    "https://YOUR-AUTHORIZED-CONTEST-DOMAIN/api/vote/playersearch";

  const DETAIL_URL =
    "https://YOUR-AUTHORIZED-CONTEST-DOMAIN/api/vote/user";

  if ([ACTION_ID, CATEGORY_ID, LIST_URL, DETAIL_URL].some(v => v.includes("REPLACE_WITH") || v.includes("YOUR-AUTHORIZED"))) {
    console.error("请先填写经授权的活动ID、分组ID和接口地址。");
    return;
  }

  const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

  /** 按活动接口要求，以表单格式提交请求。 */
  async function postJSON(url, body) {
    const response = await fetch(url, {
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: new URLSearchParams(body).toString()
    });

    if (!response.ok) {
      throw new Error(
        `请求失败：${response.status} ${response.statusText}`
      );
    }

    const result = await response.json();

    if (result?.code !== 1 && result?.code !== 0) {
      console.warn("接口返回异常：", result);
    }

    return result;
  }

  console.log("开始抓取成人组作品数据……");

  // ================================
  // 1. 分页获取成人组作品列表
  // ================================

  const works = [];
  const seenIds = new Set();

  for (let page = 1; page <= 500; page++) {
    console.log(`正在读取成人组作品列表：第 ${page} 页……`);

    let result;

    try {
      result = await postJSON(LIST_URL, {
        page: page,
        pagesize: PAGE_SIZE,
        sort: "no",
        limit: LIST_LIMIT,
        category: CATEGORY_ID,
        searchno: "",
        action_id: ACTION_ID,
        openid: ""
      });
    } catch (error) {
      console.error(
        `第 ${page} 页作品列表读取失败：`,
        error
      );

      alert(
        `成人组作品列表读取失败。\n\n` +
        `${error}\n\n` +
        `请截图控制台中的红色报错信息。`
      );

      return;
    }

    const list = result?.data?.list || [];

    if (list.length === 0) {
      console.log(
        `第 ${page} 页为空，作品列表读取结束。`
      );
      break;
    }

    let newCount = 0;

    for (const item of list) {
      const id = String(item.id || "");

      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        works.push(item);
        newCount++;
      }
    }

    console.log(
      `第 ${page} 页返回 ${list.length} 件，` +
      `新增 ${newCount} 件，` +
      `目前累计 ${works.length} 件。`
    );

    // 防止接口忽略页码并反复返回第一页
    if (newCount === 0) {
      console.log(
        "没有发现新的作品ID，停止继续翻页。"
      );
      break;
    }

    await sleep(WAIT_MS);
  }

  if (works.length === 0) {
    alert(
      "没有获取到成人组作品数据，请检查接口是否发生变化。"
    );
    return;
  }

  console.log(
    `成人组共获取到 ${works.length} 件作品，` +
    `开始逐一读取作品简介……`
  );

  // ================================
  // 2. 根据作品ID读取作品详情
  // ================================

  const output = [];

  for (let index = 0; index < works.length; index++) {
    const item = works[index];

    console.log(
      `正在读取 ${index + 1}/${works.length}：`,
      `编号${item.no}`,
      item.name,
      item.description
    );

    let detail = null;
    let errorMessage = "";

    const detailPayload = {
      action_id: ACTION_ID,
      action_user_id: String(item.id)
    };

    try {
      detail = await postJSON(
        DETAIL_URL,
        detailPayload
      );
    } catch (firstError) {
      console.warn(
        `编号${item.no}首次读取失败，准备重试……`,
        firstError
      );

      await sleep(800);

      try {
        detail = await postJSON(
          DETAIL_URL,
          detailPayload
        );
      } catch (secondError) {
        errorMessage = String(secondError);

        console.error(
          `编号${item.no}详情读取失败：`,
          secondError
        );
      }
    }

    const detailData = detail?.data || {};

    output.push({
      id: String(item.id || ""),
      no: String(item.no || ""),
      author: item.name || "",
      title: item.description || "",
      group:
        item.groupname_value ||
        detailData.groupname_value ||
        "成人组",
      image: item.image || "",
      images: item.images || [],

      // 单独保存简介原始内容
      introduction_html:
        detailData.content || "",

      download_error: errorMessage
    });

    await sleep(WAIT_MS);
  }

  // ================================
  // 3. 生成并下载JSON文件
  // ================================

  const successfulCount = output.filter(
    item => !item.download_error
  ).length;

  const failedCount =
    output.length - successfulCount;

  const exportData = {
    action_id: ACTION_ID,
    category_id: CATEGORY_ID,
    category_name: "成人组",
    exported_at: new Date().toISOString(),
    total: output.length,
    successful: successfulCount,
    failed: failedCount,
    works: output
  };

  const jsonText = JSON.stringify(
    exportData,
    null,
    2
  );

  const blob = new Blob(
    [jsonText],
    {
      type: "application/json;charset=utf-8"
    }
  );

  const downloadUrl =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  const timeText = new Date()
    .toLocaleString("zh-CN", {
      hour12: false
    })
    .replace(/[\/:\s]/g, "-");

  link.href = downloadUrl;

  link.download =
    `绘画大赛_成人组_${CATEGORY_ID}_` +
    `${output.length}件作品_${timeText}.json`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => {
    URL.revokeObjectURL(downloadUrl);
  }, 1000);

  console.log("成人组抓取完成：", {
    作品总数: output.length,
    成功读取: successfulCount,
    读取失败: failedCount
  });

  alert(
    `成人组抓取完成！\n\n` +
    `作品总数：${output.length}\n` +
    `成功读取：${successfulCount}\n` +
    `读取失败：${failedCount}\n\n` +
    `JSON文件已经开始下载。`
  );
})();