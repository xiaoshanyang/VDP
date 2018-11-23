$(function () {

    //BEGIN CALENDAR
    $("#my-calendar").zabuto_calendar({
        language: "en"
    });
    //END CALENDAR

    //BEGIN TO-DO-LIST
    $('.todo-list').slimScroll({
        "width": '100%',
        "height": '250px',
        "wheelStep": 30
    });
    $( ".sortable" ).sortable();
    $( ".sortable" ).disableSelection();
    //END TO-DO-LIST

    //BEGIN AREA CHART SPLINE
    var d6_1 = [["一月", 3.7],["二月", 2.3],["三月", 3.2],["四月", 4.8],["五月", 2.2]];
    var d6_2 = [["一月", 2.2],["二月", 3.8],["三月", 3.1],["四月", 3.8],["五月", 1.2]];
    $.plot("#area-chart-spline", [{
        data: d6_1,
        label: "入库",
        color: "#ffce54"
    },{
        data: d6_2,
        label: "使用",
        color: "#01b6ad"
    }], {
        series: {
            lines: {
                show: !1
            },
            splines: {
                show: !0,
                tension: .4,
                lineWidth: 2,
                fill: .8
            },
            points: {
                show: !0,
                radius: 4
            }
        },
        grid: {
            borderColor: "#fafafa",
            borderWidth: 1,
            hoverable: !0
        },
        tooltip: !0,
        tooltipOpts: {
            content: "%x : %y",
            defaultTheme: true
        },
        xaxis: {
            tickColor: "#fafafa",
            mode: "categories"
        },
        yaxis: {
            tickColor: "#fafafa"
        },
        shadowSize: 0
    });
    //END AREA CHART SPLINE

    //BEGIN BAR CHART STACK
    var d4_2 = [[0.5,"生成打印文件"],[3289,"打印完成"],[1.2,"分切完成"],[1252,"纸病完成"],[5800,"罐装完成"]];
    $.plot("#bar-chart-stack", [{
        data: d4_2,
        label: "生产平均处理时间(h)",
        color: "#ffce54"
    }], {
        series: {
            points: {
                show: !0,
                radius: 4
            },
            stack: !0,
            bars: {
                align: "center",
                horizontal: true,
                lineWidth: 1,
                show: !0,
                barWidth: .8,
                fill: .8
            }
        },
        grid: {
            horizontal: true,
            borderColor: "#fafafa",
            borderWidth: 1,
            hoverable: !0
        },
        tooltip: !0,
        tooltipOpts: {
            content: "%y: %x.0小时",
            defaultTheme: true
        },
        xaxis: {
            tickColor: "#fafafa",
            max:6000
        },
        yaxis: {
            tickColor: "#fafafa",
            mode: "categories"
        },
        shadowSize: 0
    });
    //END BAR CHART STACK

    //BEGIN CHAT FORM
    $('.chat-scroller').slimScroll({
        "width": '100%',
        "height": '270px',
        "wheelStep": 30,
        "scrollTo": "100px"
    });
    $('.chat-form input#input-chat').on("keypress", function(e){

        var $obj = $(this);
        var $me = $obj.parents('.portlet-body').find('ul.chats');
        
        if (e.which == 13) {
            var content = $obj.val();
            
            if (content !== "") {
                $me.addClass(content);
                var d = new Date();
                var h = d.getHours();
                var m = d.getMinutes();
                if (m < 10) m = "0" + m;
                $obj.val(""); // CLEAR TEXT ON TEXTAREA
                
                var element = ""; 
                element += "<li class='in'>";
                element += "<img class='avatar' src='https://s3.amazonaws.com/uifaces/faces/twitter/kolage/48.jpg'>";
                element += "<div class='message'>";
                element += "<span class='chat-arrow'></span>";
                element += "<a class='chat-name' href='#'>Admin &nbsp;</a>";
                element += "<span class='chat-datetime'>at July 6, 2014 " + h + ":" + m + "</span>";
                element += "<span class='chat-body'>" + content + "</span>";
                element += "</div>";
                element += "</li>";
                
                $me.append(element);
                var height = 0;
                $me.find('li').each(function(i, value){
                    height += parseInt($(this).height());
                });

                height += '';
                $('.chat-scroller').slimScroll({
                    scrollTo: height,
                    "wheelStep": 30,
                });
            }
        }
    });
    $('.chat-form span#btn-chat').on("click", function(e){

        e.preventDefault();
        var $obj = $(this).parents('.chat-form').find('input#input-chat');
        var $me = $obj.parents('.portlet-body').find('ul.chats');
        var content = $obj.val();

        if (content !== "") {
            $me.addClass(content);
            var d = new Date();
            var h = d.getHours();
            var m = d.getMinutes();
            if (m < 10) m = "0" + m;
            $obj.val(""); // CLEAR TEXT ON TEXTAREA
            
            var element = ""; 
            element += "<li class='in'>";
            element += "<img class='avatar' src='https://s3.amazonaws.com/uifaces/faces/twitter/kolage/48.jpg'>";
            element += "<div class='message'>";
            element += "<span class='chat-arrow'></span>";
            element += "<a class='chat-name' href='#'>Admin &nbsp;</a>";
            element += "<span class='chat-datetime'>at July 6, 2014" + h + ":" + m + "</span>";
            element += "<span class='chat-body'>" + content + "</span>";
            element += "</div>";
            element += "</li>";
            
            $me.append(element);
            var height = 0;
            $me.find('li').each(function(i, value){
                height += parseInt($(this).height());
            });
            height += '';

            $('.chat-scroller').slimScroll({
                scrollTo: height,
                "wheelStep": 30,
            });
        }
        
    });
    //END CHAT FORM

    //BEGIN COUNTER FOR SUMMARY BOX
    counterNum($(".avalqrcode h4 span:first-child"), 1, 3, 1, 50);
    counterNum($(".prepress h4 span:first-child"), 100, 1200, 100, 50);
    counterNum($(".printed h4 span:first-child"), 100, 2220, 100, 50);
    counterNum($(".slitted h4 span:first-child"), 100, 800, 100, 50);
    counterNum($(".paped h4 span:first-child"), 100, 240, 100, 10);
    counterNum($(".canned h4 span:first-child"), 1, 6, 1, 50);



    function counterNum(obj, start, end, step, duration) {
        $(obj).html(start);
        setInterval(function(){
            var val = Number($(obj).html());
            if (val < end) {
                $(obj).html(val+step);
            } else {
                clearInterval();
            }
        },duration);
    }
    //END COUNTER FOR SUMMARY BOX
});

